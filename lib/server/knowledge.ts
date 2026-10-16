import { and, asc, cosineDistance, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  RetrievalCandidate,
  RetrievalDecision,
  RetrievalDiagnostics,
  SustainabilityCaseInput,
  SourceRef,
} from "@/lib/types";
import type { ParsedDocument } from "@/lib/knowledge/parse";
import { schema, type Database } from "./db";
import type { Embedder } from "./embeddings";

const { knowledgeChunks, knowledgeDocuments } = schema;

/** Documents addressed to every department as well as the case's own. */
export const GROUP_WIDE_DEPARTMENT = "All departments";

const EXCERPT_LIMIT = 1200;

export type IngestSummary = {
  inserted: number;
  updated: number;
  unchanged: number;
  chunks: number;
};

/**
 * Stores parsed documents and their embeddings. Idempotent: a document whose
 * content hash and embedding model are unchanged is skipped.
 */
export async function ingestDocuments(
  db: Database,
  documents: ParsedDocument[],
  embedder: Embedder,
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    chunks: 0,
  };

  for (const document of documents) {
    const [existing] = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.slug, document.slug));

    if (existing && existing.contentHash === document.contentHash) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.documentId, existing.id),
            eq(knowledgeChunks.embeddingModel, embedder.model),
          ),
        );

      if (n === document.chunks.length) {
        summary.unchanged += 1;
        continue;
      }
    }

    // Embed before opening the transaction, so it stays short.
    const vectors = await embedder.embed(
      document.chunks.map((chunk) => chunk.embeddingText),
    );

    await db.transaction(async (tx) => {
      const values = {
        title: document.title,
        department: document.department,
        documentType: document.documentType,
        region: document.region,
        version: document.version,
        status: document.status,
        contentHash: document.contentHash,
        updatedAt: new Date(),
      };

      let documentId = existing?.id;

      if (documentId) {
        await tx
          .update(knowledgeDocuments)
          .set(values)
          .where(eq(knowledgeDocuments.id, documentId));
        await tx
          .delete(knowledgeChunks)
          .where(eq(knowledgeChunks.documentId, documentId));
        summary.updated += 1;
      } else {
        const [created] = await tx
          .insert(knowledgeDocuments)
          .values({ slug: document.slug, ...values })
          .returning({ id: knowledgeDocuments.id });
        documentId = created.id;
        summary.inserted += 1;
      }

      await tx.insert(knowledgeChunks).values(
        document.chunks.map((chunk, index) => ({
          documentId,
          ordinal: chunk.ordinal,
          sectionRef: chunk.sectionRef,
          heading: chunk.heading,
          content: chunk.content,
          embeddingModel: embedder.model,
          embedding: vectors[index],
        })),
      );
    });

    summary.chunks += document.chunks.length;
  }

  return summary;
}

export type KnowledgeDocumentSummary = {
  id: string;
  slug: string;
  title: string;
  department: string;
  documentType: string;
  region: string;
  version: number;
  status: string;
  chunkCount: number;
};

export async function listKnowledgeDocuments(
  db: Database,
): Promise<KnowledgeDocumentSummary[]> {
  const rows = await db
    .select({
      id: knowledgeDocuments.id,
      slug: knowledgeDocuments.slug,
      title: knowledgeDocuments.title,
      department: knowledgeDocuments.department,
      documentType: knowledgeDocuments.documentType,
      region: knowledgeDocuments.region,
      version: knowledgeDocuments.version,
      status: knowledgeDocuments.status,
      chunkCount: sql<number>`count(${knowledgeChunks.id})::int`,
    })
    .from(knowledgeDocuments)
    .leftJoin(knowledgeChunks, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
    .groupBy(knowledgeDocuments.id)
    .orderBy(
      asc(sql`case ${knowledgeDocuments.status} when 'approved' then 0 else 1 end`),
      asc(knowledgeDocuments.department),
      asc(knowledgeDocuments.title),
      desc(knowledgeDocuments.version),
    );

  return rows;
}

export type RetrievalResult = {
  sources: SourceRef[];
  /** Chunks that were eligible (approved, in scope) before ranking. */
  eligible: number;
  /** Every section considered and the decision reached on each. */
  diagnostics: RetrievalDiagnostics;
};

export function buildRetrievalQuery(input: SustainabilityCaseInput) {
  return [
    `${input.department}.`,
    `${input.issue}.`,
    `Current: ${input.currentMetric}.`,
    `Target: ${input.targetMetric}.`,
    input.operationalContext,
  ].join(" ");
}

const DECISION_ORDER: Record<RetrievalDecision, number> = {
  kept: 0,
  below_floor: 1,
  beyond_top_k: 2,
  excluded_department: 3,
  excluded_status: 4,
  excluded_model: 5,
};

/**
 * Finds the approved sections most relevant to a case, and records why every
 * other section was left out.
 *
 * Eligibility is decided by metadata first (approved status, the case's
 * department or group-wide documents, vectors from this embedding model), and
 * only then ranked by cosine similarity. A similarity floor stops weak
 * matches from being passed off as evidence. Every section in the knowledge
 * base is scored and given a decision, so a reviewer can see not only what the
 * model was shown but what it was not, and why.
 */
export async function retrieveSources(
  db: Database,
  input: SustainabilityCaseInput,
  {
    embedder,
    topK,
    minScore,
  }: { embedder: Embedder; topK: number; minScore: number },
): Promise<RetrievalResult> {
  const query = buildRetrievalQuery(input);
  const [queryVector] = await embedder.embed([query]);
  const similarity = sql<number>`1 - (${cosineDistance(knowledgeChunks.embedding, queryVector)})`;

  const rows = await db
    .select({
      chunkId: knowledgeChunks.id,
      documentId: knowledgeDocuments.id,
      documentTitle: knowledgeDocuments.title,
      documentVersion: knowledgeDocuments.version,
      documentStatus: knowledgeDocuments.status,
      documentType: knowledgeDocuments.documentType,
      department: knowledgeDocuments.department,
      sectionRef: knowledgeChunks.sectionRef,
      heading: knowledgeChunks.heading,
      embeddingModel: knowledgeChunks.embeddingModel,
      score: similarity,
    })
    .from(knowledgeChunks)
    .innerJoin(
      knowledgeDocuments,
      eq(knowledgeDocuments.id, knowledgeChunks.documentId),
    );

  const inScope = new Set([input.department, GROUP_WIDE_DEPARTMENT]);
  const round = (value: number) => Math.round(value * 1000) / 1000;

  type Row = (typeof rows)[number];
  const eligible: Row[] = [];
  const excluded: Array<{ row: Row; decision: RetrievalDecision }> = [];

  for (const row of rows) {
    if (row.embeddingModel !== embedder.model) {
      excluded.push({ row, decision: "excluded_model" });
    } else if (row.documentStatus !== "approved") {
      excluded.push({ row, decision: "excluded_status" });
    } else if (!inScope.has(row.department)) {
      excluded.push({ row, decision: "excluded_department" });
    } else {
      eligible.push(row);
    }
  }

  eligible.sort((a, b) => Number(b.score) - Number(a.score));

  const decided: Array<{ row: Row; decision: RetrievalDecision }> = [
    ...eligible.map((row, rank) => ({
      row,
      decision: (rank >= topK
        ? "beyond_top_k"
        : Number(row.score) >= minScore
          ? "kept"
          : "below_floor") as RetrievalDecision,
    })),
    ...excluded,
  ];

  const keptRows = decided
    .filter((entry) => entry.decision === "kept")
    .map((entry) => entry.row);
  const contents = keptRows.length
    ? await db
        .select({ id: knowledgeChunks.id, content: knowledgeChunks.content })
        .from(knowledgeChunks)
        .where(
          inArray(
            knowledgeChunks.id,
            keptRows.map((row) => row.chunkId),
          ),
        )
    : [];
  const contentById = new Map(contents.map((row) => [row.id, row.content]));

  const sources: SourceRef[] = keptRows.map((row, index) => ({
    id: `S${index + 1}`,
    chunkId: row.chunkId,
    documentId: row.documentId,
    documentTitle: row.documentTitle,
    documentVersion: row.documentVersion,
    documentType: row.documentType,
    department: row.department,
    sectionRef: row.sectionRef,
    heading: row.heading,
    excerpt: (contentById.get(row.chunkId) ?? "").slice(0, EXCERPT_LIMIT),
    score: round(Number(row.score)),
  }));

  const candidates: RetrievalCandidate[] = decided
    .map(({ row, decision }) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      documentVersion: row.documentVersion,
      documentStatus: row.documentStatus,
      department: row.department,
      sectionRef: row.sectionRef,
      heading: row.heading,
      score:
        decision === "excluded_model" ? null : round(Number(row.score)),
      decision,
    }))
    .sort(
      (a, b) =>
        DECISION_ORDER[a.decision] - DECISION_ORDER[b.decision] ||
        (b.score ?? -1) - (a.score ?? -1),
    );

  return {
    sources,
    eligible: eligible.length,
    diagnostics: {
      query,
      embeddingModel: embedder.model,
      topK,
      minScore,
      caseDepartment: input.department,
      candidates,
    },
  };
}

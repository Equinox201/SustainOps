import fs from "node:fs";
import path from "node:path";
import { parseKnowledgeDocument } from "@/lib/knowledge/parse";
import { schema, type Database } from "@/lib/server/db";
import type { Embedder } from "@/lib/server/embeddings";
import { ingestDocuments, retrieveSources } from "@/lib/server/knowledge";
import { createTestDb } from "@/lib/server/test-db";
import type { SourceRef } from "@/lib/types";
import { scoreRetrieval, type RetrievedRef } from "./metrics";
import type { EvalCase, RetrievalCaseResult } from "./types";

export type EvalWorld = {
  db: Database;
  embedder: Embedder;
  slugById: Map<string, string>;
  corpus: { documents: number; approvedDocuments: number; sections: number };
};

/**
 * A fresh in-memory database with the real migrations and the real corpus.
 * Evals never touch the live database, so they are repeatable and cannot
 * disturb (or depend on) whatever data it holds.
 */
export async function buildEvalWorld(embedder: Embedder): Promise<EvalWorld> {
  const db = await createTestDb();
  const directory = path.join(process.cwd(), "knowledge");
  const documents = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .sort()
    .map((file) =>
      parseKnowledgeDocument(
        fs.readFileSync(path.join(directory, file), "utf8"),
        file,
      ),
    );

  await ingestDocuments(db, documents, embedder);

  const rows = await db
    .select({
      id: schema.knowledgeDocuments.id,
      slug: schema.knowledgeDocuments.slug,
    })
    .from(schema.knowledgeDocuments);

  return {
    db,
    embedder,
    slugById: new Map(rows.map((row) => [row.id, row.slug])),
    corpus: {
      documents: documents.length,
      approvedDocuments: documents.filter((d) => d.status === "approved").length,
      sections: documents.reduce((sum, d) => sum + d.chunks.length, 0),
    },
  };
}

export function toRetrievedRefs(
  sources: SourceRef[],
  slugById: Map<string, string>,
): RetrievedRef[] {
  return sources.map((source) => ({
    id: source.id,
    slug: slugById.get(source.documentId) ?? "unknown",
    sectionRef: source.sectionRef,
    score: source.score,
  }));
}

export async function runRetrievalEval(
  world: EvalWorld,
  cases: EvalCase[],
  { topK, minScore }: { topK: number; minScore: number },
): Promise<Map<string, RetrievalCaseResult>> {
  const results = new Map<string, RetrievalCaseResult>();

  for (const evalCase of cases) {
    const { sources } = await retrieveSources(world.db, evalCase.input, {
      embedder: world.embedder,
      topK,
      minScore,
    });

    results.set(
      evalCase.id,
      scoreRetrieval(evalCase, toRetrievedRefs(sources, world.slugById)),
    );
  }

  return results;
}

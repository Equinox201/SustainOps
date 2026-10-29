import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import {
  KnowledgeParseError,
  parseKnowledgeDocument,
  type ParsedDocument,
} from "@/lib/knowledge/parse";
import {
  KNOWLEDGE_LIMITS,
  type KnowledgeDraftInput,
} from "@/lib/schemas/knowledge";
import {
  can,
  type Permission,
  type Principal,
} from "@/features/action-plans/domain/permissions";
import { departmentOptions } from "@/features/action-plans/constants";
import type { AuditEventType } from "@/lib/types";
import { ApiError } from "./api";
import { schema, type Database } from "./db";
import type { Embedder } from "./embeddings";
import { GROUP_WIDE_DEPARTMENT } from "./knowledge";

const { auditEvents, knowledgeChunks, knowledgeDocuments, users } = schema;

/** A publish that has been "processing" this long is assumed to have died. */
const STALE_PROCESSING_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WriteContext = { requestId: string | null; actor: Principal };

export type KnowledgeDocumentInfo = {
  id: string;
  slug: string;
  documentKey: string;
  title: string;
  department: string;
  documentType: string;
  region: string;
  version: number;
  status: string;
  indexStatus: string | null;
  indexError: string | null;
  origin: string;
  chunkCount: number;
  createdBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
};

export type KnowledgeSection = {
  sectionRef: string;
  heading: string;
  content: string;
};

export type KnowledgeDocumentDetail = {
  document: KnowledgeDocumentInfo;
  sections: KnowledgeSection[];
  /** The text a draft is written in (drafts only). */
  markdown: string | null;
};

function require(actor: Principal, permission: Permission) {
  if (!can(actor, permission)) {
    throw new ApiError(
      403,
      "forbidden",
      "Your role is not allowed to do this.",
      { permission },
    );
  }
}

export function slugifyKey(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function audit(
  db: Database,
  context: WriteContext,
  eventType: AuditEventType,
  document: { id: string; documentKey: string; version: number; department: string },
  comment?: string,
) {
  await db.insert(auditEvents).values({
    eventType,
    planId: null,
    department: document.department,
    actorUserId: context.actor.id,
    actorRole: context.actor.role,
    requestId: context.requestId,
    metadata: {
      documentId: document.id,
      documentKey: document.documentKey,
      version: document.version,
      ...(comment ? { comment } : {}),
    },
  });
}

function frontMatter(fields: Record<string, string | number>, body: string) {
  const head = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return `---\n${head}\n---\n\n${body.trim()}\n`;
}

/** Parses a draft, turning parser complaints into a readable 422. */
function parseDraft(markdown: string): ParsedDocument {
  try {
    const parsed = parseKnowledgeDocument(markdown, "draft");

    if (parsed.chunks.length > KNOWLEDGE_LIMITS.sections) {
      throw new KnowledgeParseError(
        `draft: too many sections (${parsed.chunks.length}); the limit is ${KNOWLEDGE_LIMITS.sections}`,
      );
    }

    return parsed;
  } catch (error) {
    if (error instanceof KnowledgeParseError) {
      throw new ApiError(
        422,
        "invalid_document",
        error.message.replace(/^draft: /, "").replace(/^\w/, (c) => c.toUpperCase()),
      );
    }

    throw error;
  }
}

type Row = typeof knowledgeDocuments.$inferSelect;

async function toInfo(db: Database, rows: Row[]): Promise<KnowledgeDocumentInfo[]> {
  if (rows.length === 0) {
    return [];
  }

  const people = await db.select({ id: users.id, name: users.name }).from(users);
  const nameOf = (id: string | null) => {
    const person = id ? people.find((p) => p.id === id) : undefined;

    return person ? { id: person.id, name: person.name } : null;
  };
  const counts = await db
    .select({
      documentId: knowledgeChunks.documentId,
      n: sql<number>`count(*)::int`,
    })
    .from(knowledgeChunks)
    .where(
      inArray(
        knowledgeChunks.documentId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(knowledgeChunks.documentId);
  const chunkCount = new Map(counts.map((row) => [row.documentId, row.n]));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    documentKey: row.documentKey,
    title: row.title,
    department: row.department,
    documentType: row.documentType,
    region: row.region,
    version: row.version,
    status: row.status,
    indexStatus: row.indexStatus,
    indexError: row.indexError,
    origin: row.origin,
    chunkCount: chunkCount.get(row.id) ?? 0,
    createdBy: nameOf(row.createdBy),
    approvedBy: nameOf(row.approvedBy),
    approvedAt: row.approvedAt?.toISOString() ?? null,
  }));
}

const STATUS_ORDER = sql`case ${knowledgeDocuments.status}
  when 'draft' then 0 when 'approved' then 1 when 'superseded' then 2 else 3 end`;

export async function listKnowledge(db: Database): Promise<KnowledgeDocumentInfo[]> {
  const rows = await db
    .select()
    .from(knowledgeDocuments)
    .orderBy(
      asc(STATUS_ORDER),
      asc(knowledgeDocuments.department),
      asc(knowledgeDocuments.title),
      desc(knowledgeDocuments.version),
    );

  return toInfo(db, rows);
}

async function loadRow(db: Database, id: string): Promise<Row> {
  const [row] = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, id));

  if (!row) {
    throw new ApiError(404, "document_not_found", "Document not found.");
  }

  return row;
}

/** A document with its sections: parsed from the draft text, or as indexed. */
export async function getKnowledgeDocument(
  db: Database,
  id: string,
): Promise<KnowledgeDocumentDetail> {
  const row = await loadRow(db, id);
  const [document] = await toInfo(db, [row]);

  if (row.status === "draft" && row.sourceMarkdown) {
    const parsed = parseDraft(row.sourceMarkdown);

    return {
      document,
      sections: parsed.chunks.map((chunk) => ({
        sectionRef: chunk.sectionRef,
        heading: chunk.heading,
        content: chunk.content,
      })),
      markdown: row.sourceMarkdown,
    };
  }

  const chunks = await db
    .select({
      sectionRef: knowledgeChunks.sectionRef,
      heading: knowledgeChunks.heading,
      content: knowledgeChunks.content,
    })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.documentId, id))
    .orderBy(asc(knowledgeChunks.ordinal));

  return { document, sections: chunks, markdown: null };
}

type DraftMeta = {
  key: string;
  version: number;
  title: string;
  department: string;
  documentType: string;
};

/**
 * Works out what a draft is: a brand-new document (a fresh key, version 1) or
 * the next version of an existing one, which keeps its title, department and
 * type. Checks the department is one this organisation has.
 */
async function resolveDraftMeta(
  db: Database,
  input: KnowledgeDraftInput,
  { ignoreRowId }: { ignoreRowId?: string } = {},
): Promise<DraftMeta> {
  if (input.documentKey) {
    const existing = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.documentKey, input.documentKey))
      .orderBy(desc(knowledgeDocuments.version));
    const others = existing.filter((row) => row.id !== ignoreRowId);

    if (others.length === 0 && existing.length === 0) {
      throw new ApiError(404, "document_not_found", "That document does not exist.");
    }

    const latest = existing[0];
    const ownVersion = existing.find((row) => row.id === ignoreRowId)?.version;

    return {
      key: input.documentKey,
      version: ownVersion ?? latest.version + 1,
      title: latest.title,
      department: latest.department,
      documentType: latest.documentType,
    };
  }

  const key = slugifyKey(input.title);

  if (!key) {
    throw new ApiError(422, "invalid_document", "The title needs some letters or numbers.");
  }

  if (![...departmentOptions, GROUP_WIDE_DEPARTMENT].includes(input.department)) {
    throw new ApiError(422, "invalid_document", "Choose one of the listed departments.");
  }

  const [taken] = await db
    .select({ id: knowledgeDocuments.id })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.documentKey, key));

  if (taken && taken.id !== ignoreRowId) {
    throw new ApiError(
      409,
      "document_exists",
      "A document with this title already exists. Write a new version of it instead.",
      { documentKey: key },
    );
  }

  return {
    key,
    version: 1,
    title: input.title,
    department: input.department,
    documentType: input.documentType,
  };
}

function draftMarkdown(meta: DraftMeta, body: string) {
  return frontMatter(
    {
      title: meta.title,
      slug: `${meta.key}-v${meta.version}`,
      department: meta.department,
      document_type: meta.documentType,
      region: "apac",
      version: meta.version,
      status: "draft",
    },
    body,
  );
}

/**
 * Checks a draft without saving it, so the author can see how it will be
 * split into citeable sections before anything is stored.
 */
export async function previewDraft(
  db: Database,
  input: KnowledgeDraftInput,
  actor: Principal,
): Promise<{ sections: KnowledgeSection[]; version: number }> {
  require(actor, "knowledge:edit");

  const meta = await resolveDraftMeta(db, input);
  const parsed = parseDraft(draftMarkdown(meta, input.body));

  return {
    version: meta.version,
    sections: parsed.chunks.map((chunk) => ({
      sectionRef: chunk.sectionRef,
      heading: chunk.heading,
      content: chunk.content,
    })),
  };
}

export async function saveDraft(
  db: Database,
  input: KnowledgeDraftInput,
  context: WriteContext,
  { userDocumentCap }: { userDocumentCap: number },
): Promise<KnowledgeDocumentDetail> {
  require(context.actor, "knowledge:edit");

  return db.transaction(async (tx) => {
    const meta = await resolveDraftMeta(tx, input);
    const markdown = draftMarkdown(meta, input.body);
    const parsed = parseDraft(markdown);

    const [draftForKey] = await tx
      .select({ id: knowledgeDocuments.id })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.documentKey, meta.key),
          eq(knowledgeDocuments.status, "draft"),
        ),
      );

    if (draftForKey) {
      throw new ApiError(
        409,
        "draft_exists",
        "There is already a draft of this document. Edit that one.",
        { documentId: draftForKey.id },
      );
    }

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.origin, "user"));

    if (n >= userDocumentCap) {
      throw new ApiError(
        429,
        "knowledge_cap_reached",
        "The demo's limit on documents written in the app has been reached. It resets nightly.",
      );
    }

    const [row] = await tx
      .insert(knowledgeDocuments)
      .values({
        slug: `${meta.key}-v${meta.version}`,
        documentKey: meta.key,
        title: meta.title,
        department: meta.department,
        documentType: meta.documentType,
        region: "apac",
        version: meta.version,
        status: "draft",
        origin: "user",
        sourceMarkdown: markdown,
        contentHash: parsed.contentHash,
        createdBy: context.actor.id,
      })
      .returning();

    await audit(tx, context, "knowledge_draft_saved", row);

    return getKnowledgeDocument(tx, row.id);
  });
}

export async function updateDraft(
  db: Database,
  id: string,
  input: KnowledgeDraftInput,
  context: WriteContext,
): Promise<KnowledgeDocumentDetail> {
  require(context.actor, "knowledge:edit");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, id))
      .for("update");

    if (!row) {
      throw new ApiError(404, "document_not_found", "Document not found.");
    }

    if (row.status !== "draft" || row.origin !== "user") {
      throw new ApiError(
        409,
        "not_a_draft",
        "Only a draft can be edited. Published versions are immutable; write a new version instead.",
      );
    }

    if (row.indexStatus === "processing") {
      throw new ApiError(409, "already_processing", "This document is being published.");
    }

    // The key and version of a draft are fixed once it exists.
    const meta = await resolveDraftMeta(
      tx,
      { ...input, documentKey: row.documentKey },
      { ignoreRowId: id },
    );
    const markdown = draftMarkdown({ ...meta, version: row.version }, input.body);
    const parsed = parseDraft(markdown);

    await tx
      .update(knowledgeDocuments)
      .set({
        sourceMarkdown: markdown,
        contentHash: parsed.contentHash,
        indexStatus: null,
        indexError: null,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocuments.id, id));
    await audit(tx, context, "knowledge_draft_saved", row);

    return getKnowledgeDocument(tx, id);
  });
}

export async function deleteDraft(
  db: Database,
  id: string,
  context: WriteContext,
): Promise<void> {
  require(context.actor, "knowledge:edit");

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, id))
      .for("update");

    if (!row) {
      throw new ApiError(404, "document_not_found", "Document not found.");
    }

    if (row.status !== "draft" || row.origin !== "user") {
      throw new ApiError(409, "not_a_draft", "Only a draft can be deleted.");
    }

    if (row.indexStatus === "processing") {
      throw new ApiError(409, "already_processing", "This document is being published.");
    }

    await tx.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
  });
}

/**
 * Publishes a draft: embeds its sections, makes it the approved version and
 * supersedes the version it replaces. Separation of duties applies as it does
 * to plans: the author cannot approve their own document.
 *
 * Embedding is a network call, so it happens outside any transaction. While it
 * runs the document is "processing"; if it fails the document stays a draft,
 * marked "failed", and publishing again retries. Nothing is retrievable until
 * every section has a vector.
 */
export async function publishDocument(
  db: Database,
  id: string,
  context: WriteContext,
  { embedder, dailyCap }: { embedder: Embedder; dailyCap: number },
): Promise<KnowledgeDocumentDetail> {
  require(context.actor, "knowledge:publish");

  // 1. Claim the document.
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, id))
      .for("update");

    if (!row) {
      throw new ApiError(404, "document_not_found", "Document not found.");
    }

    if (row.status !== "draft" || !row.sourceMarkdown) {
      throw new ApiError(409, "not_a_draft", "Only a draft can be published.");
    }

    if (row.createdBy === context.actor.id) {
      throw new ApiError(
        403,
        "self_approval_forbidden",
        "The author of a document cannot publish it. Another reviewer must.",
      );
    }

    const staleSince = new Date(Date.now() - STALE_PROCESSING_MS);

    if (row.indexStatus === "processing" && row.updatedAt > staleSince) {
      throw new ApiError(409, "already_processing", "This document is already being published.");
    }

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(auditEvents)
      .where(
        and(
          or(
            eq(auditEvents.eventType, "knowledge_published"),
            eq(auditEvents.eventType, "knowledge_publish_failed"),
          ),
          gte(auditEvents.createdAt, new Date(Date.now() - DAY_MS)),
        ),
      );

    if (n >= dailyCap) {
      throw new ApiError(
        429,
        "knowledge_publish_cap",
        "The demo's daily limit on publishing documents has been reached. Please try again tomorrow.",
      );
    }

    await tx
      .update(knowledgeDocuments)
      .set({ indexStatus: "processing", indexError: null, updatedAt: new Date() })
      .where(eq(knowledgeDocuments.id, id));

    return row;
  });

  // 2. Embed, outside any transaction.
  try {
    const parsed = parseDraft(claimed.sourceMarkdown!);
    const vectors = await embedder.embed(
      parsed.chunks.map((chunk) => chunk.embeddingText),
    );

    if (vectors.length !== parsed.chunks.length) {
      throw new Error("embedding count mismatch");
    }

    // 3. Make it the approved version, atomically.
    await db.transaction(async (tx) => {
      const family = await tx
        .select()
        .from(knowledgeDocuments)
        .where(eq(knowledgeDocuments.documentKey, claimed.documentKey))
        .for("update");
      const self = family.find((row) => row.id === id);

      if (!self || self.status !== "draft") {
        throw new ApiError(409, "not_a_draft", "This draft changed while it was being published.");
      }

      await tx.insert(knowledgeChunks).values(
        parsed.chunks.map((chunk, index) => ({
          documentId: id,
          ordinal: chunk.ordinal,
          sectionRef: chunk.sectionRef,
          heading: chunk.heading,
          content: chunk.content,
          embeddingModel: embedder.model,
          embedding: vectors[index],
        })),
      );

      const superseded = family.filter(
        (row) => row.id !== id && row.status === "approved",
      );

      if (superseded.length > 0) {
        await tx
          .update(knowledgeDocuments)
          .set({ status: "superseded", updatedAt: new Date() })
          .where(
            inArray(
              knowledgeDocuments.id,
              superseded.map((row) => row.id),
            ),
          );
      }

      await tx
        .update(knowledgeDocuments)
        .set({
          status: "approved",
          indexStatus: "available",
          indexError: null,
          contentHash: parsed.contentHash,
          approvedBy: context.actor.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(knowledgeDocuments.id, id));
      await audit(
        tx,
        context,
        "knowledge_published",
        claimed,
        superseded.length > 0
          ? `Superseded v${superseded.map((row) => row.version).join(", v")}`
          : undefined,
      );
    });
  } catch (error) {
    const known = error instanceof ApiError ? error : null;
    // Never store provider internals: a short, stable reason is enough.
    const reason = known
      ? known.message
      : "Embedding the sections failed. Check the embedding service and retry.";

    await db.transaction(async (tx) => {
      await tx
        .update(knowledgeDocuments)
        .set({ indexStatus: "failed", indexError: reason, updatedAt: new Date() })
        .where(and(eq(knowledgeDocuments.id, id), eq(knowledgeDocuments.status, "draft")));
      await audit(tx, context, "knowledge_publish_failed", claimed, reason);
    });

    console.warn("knowledge publish failed", {
      requestId: context.requestId,
      documentId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    throw known ?? new ApiError(502, "indexing_failed", reason);
  }

  return getKnowledgeDocument(db, id);
}

/**
 * Takes an approved document out of use. Plans keep the sections they were
 * generated from; new plans stop seeing it. Does not restore an earlier
 * version: that is a decision for a person.
 */
export async function withdrawDocument(
  db: Database,
  id: string,
  reason: string,
  context: WriteContext,
): Promise<KnowledgeDocumentDetail> {
  require(context.actor, "knowledge:publish");

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, id))
      .for("update");

    if (!row) {
      throw new ApiError(404, "document_not_found", "Document not found.");
    }

    if (row.status !== "approved") {
      throw new ApiError(409, "not_approved", "Only an approved document can be withdrawn.");
    }

    await tx
      .update(knowledgeDocuments)
      .set({ status: "withdrawn", updatedAt: new Date() })
      .where(eq(knowledgeDocuments.id, id));
    await audit(tx, context, "knowledge_withdrawn", row, reason);
  });

  return getKnowledgeDocument(db, id);
}

/**
 * Returns the knowledge base to its shipped state: removes documents written
 * in the app and restores each shipped document's original status. Used by the
 * nightly reset, so a visitor's experiments never outlive the day.
 */
export async function resetKnowledgeBase(db: Database): Promise<{
  removed: number;
  restored: number;
}> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(knowledgeDocuments)
      .where(eq(knowledgeDocuments.origin, "user"))
      .returning({ id: knowledgeDocuments.id });
    const restored = await tx
      .update(knowledgeDocuments)
      .set({
        status: sql`${knowledgeDocuments.seedStatus}`,
        approvedBy: null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(knowledgeDocuments.origin, "corpus"),
          sql`${knowledgeDocuments.seedStatus} is not null`,
          sql`${knowledgeDocuments.status} <> ${knowledgeDocuments.seedStatus}`,
        ),
      )
      .returning({ id: knowledgeDocuments.id });

    return { removed: removed.length, restored: restored.length };
  });
}

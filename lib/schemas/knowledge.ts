import { z } from "zod";

/**
 * Limits on documents written in the app. The demo is public, so every write
 * surface is bounded: a document is a few pages, not a corpus.
 */
export const KNOWLEDGE_LIMITS = {
  title: 120,
  body: 20_000,
  sections: 20,
  withdrawReason: 300,
} as const;

export const DOCUMENT_TYPES = ["sop", "policy", "guide"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const KNOWLEDGE_STATUSES = [
  "draft",
  "approved",
  "superseded",
  "withdrawn",
] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const INDEX_STATUSES = ["processing", "available", "failed"] as const;
export type IndexStatus = (typeof INDEX_STATUSES)[number];

const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\r\n]+$/, "Must be a single line");

/**
 * A draft of a document. For a new version of an existing document, pass its
 * `documentKey`; its title, department and type then come from the existing
 * document and cannot be changed.
 */
export const knowledgeDraftSchema = z.strictObject({
  documentKey: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(80)
    .optional(),
  title: oneLine(KNOWLEDGE_LIMITS.title),
  department: oneLine(80),
  documentType: z.enum(DOCUMENT_TYPES),
  body: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.body),
});

export const withdrawRequestSchema = z.strictObject({
  reason: z.string().trim().min(1).max(KNOWLEDGE_LIMITS.withdrawReason),
});

export type KnowledgeDraftInput = z.infer<typeof knowledgeDraftSchema>;

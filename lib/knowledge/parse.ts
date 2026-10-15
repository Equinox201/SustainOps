import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Parses a knowledge document (Markdown with front matter) into chunks.
 *
 * A chunk is one numbered `###` section. Its number becomes the citation
 * reference ("### 4.3 Threshold batching" -> "§4.3"), so a plan can point at
 * the exact clause it relies on.
 */

export const DOCUMENT_STATUSES = ["approved", "draft", "superseded"] as const;

const frontMatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  department: z.string().min(1),
  document_type: z.string().min(1),
  region: z.string().min(1),
  version: z.coerce.number().int().min(1),
  status: z.enum(DOCUMENT_STATUSES),
});

export type ParsedChunk = {
  ordinal: number;
  sectionRef: string;
  heading: string;
  /** The section body, as written. */
  content: string;
  /** What gets embedded: the body with its document and group context. */
  embeddingText: string;
};

export type ParsedDocument = {
  slug: string;
  title: string;
  department: string;
  documentType: string;
  region: string;
  version: number;
  status: (typeof DOCUMENT_STATUSES)[number];
  contentHash: string;
  chunks: ParsedChunk[];
};

export class KnowledgeParseError extends Error {}

function splitFrontMatter(raw: string, source: string) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    throw new KnowledgeParseError(`${source}: missing front matter`);
  }

  const fields: Record<string, string> = {};

  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");

    if (separator > 0) {
      fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }

  return { fields, body: match[2] };
}

export function parseKnowledgeDocument(
  raw: string,
  source = "document",
): ParsedDocument {
  const { fields, body } = splitFrontMatter(raw, source);
  const meta = frontMatterSchema.safeParse(fields);

  if (!meta.success) {
    const problems = meta.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new KnowledgeParseError(`${source}: invalid front matter (${problems})`);
  }

  const chunks: ParsedChunk[] = [];
  const seenRefs = new Set<string>();
  let group = "";
  let current: { ref: string; heading: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) {
      return;
    }

    const content = current.lines.join("\n").trim();

    if (content.length > 0) {
      chunks.push({
        ordinal: chunks.length,
        sectionRef: current.ref,
        heading: current.heading,
        content,
        embeddingText: `${meta.data.title}. ${group}: ${current.heading}.\n${content}`,
      });
    }

    current = null;
  };

  for (const line of body.split(/\r?\n/)) {
    const groupMatch = line.match(/^##\s+(.*\S)\s*$/);
    const sectionMatch = line.match(/^###\s+(\d+(?:\.\d+)*)\s+(.*\S)\s*$/);

    if (sectionMatch) {
      flush();
      const ref = `§${sectionMatch[1]}`;

      if (seenRefs.has(ref)) {
        throw new KnowledgeParseError(`${source}: duplicate section ${ref}`);
      }

      seenRefs.add(ref);
      current = { ref, heading: sectionMatch[2], lines: [] };
    } else if (groupMatch) {
      flush();
      group = groupMatch[1].replace(/^\d+(\.\d+)*\.?\s*/, "");
    } else if (current) {
      current.lines.push(line);
    }
  }

  flush();

  if (chunks.length === 0) {
    throw new KnowledgeParseError(`${source}: no numbered ### sections found`);
  }

  return {
    slug: meta.data.slug,
    title: meta.data.title,
    department: meta.data.department,
    documentType: meta.data.document_type,
    region: meta.data.region,
    version: meta.data.version,
    status: meta.data.status,
    contentHash: createHash("sha256").update(raw).digest("hex"),
    chunks,
  };
}

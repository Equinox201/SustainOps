import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KnowledgeParseError, parseKnowledgeDocument } from "./parse";

const doc = (overrides = "", body = "") => `---
title: Test SOP
slug: test-sop
department: Housekeeping
document_type: sop
region: apac
version: 2
status: approved
${overrides}---

> Synthetic.

## 1. Purpose

### 1.1 Scope
Applies to rooms.

## 4. Operations

### 4.3 Threshold batching
Run full loads only.
Batch low-volume items.
${body}`;

describe("parseKnowledgeDocument", () => {
  it("reads metadata and turns numbered sections into citeable chunks", () => {
    const parsed = parseKnowledgeDocument(doc(), "test.md");

    expect(parsed).toMatchObject({
      slug: "test-sop",
      title: "Test SOP",
      department: "Housekeeping",
      documentType: "sop",
      version: 2,
      status: "approved",
    });
    expect(parsed.chunks.map((chunk) => chunk.sectionRef)).toEqual([
      "§1.1",
      "§4.3",
    ]);
    expect(parsed.chunks[1]).toMatchObject({
      heading: "Threshold batching",
      content: "Run full loads only.\nBatch low-volume items.",
    });
  });

  it("embeds each section with its document and group context", () => {
    const [, batching] = parseKnowledgeDocument(doc()).chunks;

    expect(batching.embeddingText).toContain("Test SOP");
    expect(batching.embeddingText).toContain("Operations");
    expect(batching.embeddingText).toContain("Run full loads only.");
  });

  it("is stable: the same text hashes the same, different text does not", () => {
    expect(parseKnowledgeDocument(doc()).contentHash).toBe(
      parseKnowledgeDocument(doc()).contentHash,
    );
    expect(parseKnowledgeDocument(doc()).contentHash).not.toBe(
      parseKnowledgeDocument(doc("", "More.")).contentHash,
    );
  });

  it("rejects documents that cannot be cited reliably", () => {
    expect(() => parseKnowledgeDocument("no front matter")).toThrow(
      KnowledgeParseError,
    );
    expect(() =>
      parseKnowledgeDocument(doc().replace("status: approved", "status: live")),
    ).toThrow(/invalid front matter/);
    expect(() =>
      parseKnowledgeDocument(doc().replace("### 4.3", "### 1.1")),
    ).toThrow(/duplicate section §1.1/);
    expect(() =>
      parseKnowledgeDocument("---\ntitle: T\nslug: t\ndepartment: D\ndocument_type: sop\nregion: r\nversion: 1\nstatus: approved\n---\nNo sections here"),
    ).toThrow(/no numbered/);
  });
});

describe("the shipped knowledge base", () => {
  const directory = path.join(process.cwd(), "knowledge");
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".md") && file !== "README.md");
  const documents = files.map((file) =>
    parseKnowledgeDocument(fs.readFileSync(path.join(directory, file), "utf8"), file),
  );

  it("parses every document and labels each one synthetic", () => {
    expect(documents.length).toBeGreaterThanOrEqual(6);

    for (const file of files) {
      expect(fs.readFileSync(path.join(directory, file), "utf8")).toMatch(
        /Synthetic document created for demonstration purposes/,
      );
    }
  });

  it("has unique slugs and at least one non-approved version", () => {
    const slugs = documents.map((document) => document.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(documents.some((document) => document.status === "superseded")).toBe(
      true,
    );
  });

  it("keeps every section a sensible size for retrieval", () => {
    for (const document of documents) {
      for (const chunk of document.chunks) {
        expect(chunk.content.length).toBeGreaterThan(40);
        expect(chunk.content.length).toBeLessThan(1500);
      }
    }
  });
});

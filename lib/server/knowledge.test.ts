import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { parseKnowledgeDocument } from "@/lib/knowledge/parse";
import type { SustainabilityCaseInput } from "@/lib/types";
import type { Database } from "./db";
import { defaultMinScore, hashEmbedder } from "./embeddings";
import {
  ingestDocuments,
  listKnowledgeDocuments,
  retrieveSources,
} from "./knowledge";
import { createTestDb } from "./test-db";

let db: Database;

function loadCorpus() {
  const directory = path.join(process.cwd(), "knowledge");

  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .map((file) =>
      parseKnowledgeDocument(
        fs.readFileSync(path.join(directory, file), "utf8"),
        file,
      ),
    );
}

const options = {
  embedder: hashEmbedder,
  topK: 6,
  minScore: defaultMinScore(hashEmbedder),
};

function search(input: SustainabilityCaseInput) {
  return retrieveSources(db, input, options);
}

const base = {
  property: "Harbour House Singapore",
  currentMetric: "",
  targetMetric: "",
  operationalContext: "",
};

beforeAll(async () => {
  db = await createTestDb();
  await ingestDocuments(db, loadCorpus(), hashEmbedder);
});

describe("ingestion", () => {
  it("stores every document and section", async () => {
    const documents = await listKnowledgeDocuments(db);

    expect(documents.length).toBe(loadCorpus().length);
    expect(documents.every((document) => document.chunkCount > 0)).toBe(true);
  });

  it("is idempotent", async () => {
    const summary = await ingestDocuments(db, loadCorpus(), hashEmbedder);

    expect(summary).toMatchObject({ inserted: 0, updated: 0, chunks: 0 });
    expect(summary.unchanged).toBe(loadCorpus().length);
  });

  it("re-embeds a document whose text changed", async () => {
    const [first, ...rest] = loadCorpus();
    const edited = {
      ...first,
      contentHash: "changed",
      chunks: first.chunks.map((chunk) => ({ ...chunk })),
    };

    const summary = await ingestDocuments(db, [edited, ...rest], hashEmbedder);

    expect(summary).toMatchObject({ updated: 1, inserted: 0 });

    // restore
    await ingestDocuments(db, [first], hashEmbedder);
  });
});

describe("retrieval", () => {
  it("grounds a laundry case in the current housekeeping SOP, not the superseded one", async () => {
    const { sources } = await search({
      ...base,
      department: "Housekeeping",
      issue: "Laundry usage increased above baseline",
      currentMetric: "18% increase in laundry kg per occupied room",
      targetMetric: "Return to baseline within 60 days",
      operationalContext:
        "Inconsistent towel reuse card placement and washers running partial loads.",
    });

    expect(sources.length).toBeGreaterThan(0);
    expect(
      sources.every((source) => source.documentTitle !== "Food Waste Measurement and Buffet Guidelines"),
    ).toBe(true);
    expect(sources[0]).toMatchObject({
      documentTitle: "Housekeeping Resource Efficiency SOP",
      documentVersion: 2,
    });
    expect(
      sources.some(
        (source) =>
          source.documentTitle === "Housekeeping Resource Efficiency SOP" &&
          source.documentVersion === 1,
      ),
    ).toBe(false);
  });

  it("grounds a pastry-waste case in the food waste SOP and never in housekeeping", async () => {
    const { sources } = await search({
      ...base,
      department: "Food & Beverage",
      issue: "Breakfast buffet croissant waste is high",
      currentMetric: "14% of pastry produced is unsold",
      targetMetric: "Below 8% within 30 days",
      operationalContext:
        "Large trays of croissants are put out at the start of service and replenished late.",
    });

    expect(sources[0].documentTitle).toBe(
      "Food Waste Measurement and Buffet Guidelines",
    );
    expect(
      sources.some((source) => source.documentTitle.startsWith("Housekeeping")),
    ).toBe(false);
    expect(sources.map((source) => source.sectionRef)).toEqual(
      expect.arrayContaining(["§3.3"]),
    );
  });

  it("grounds a low-occupancy energy case in the HVAC SOP", async () => {
    const { sources } = await search({
      ...base,
      department: "Engineering",
      issue: "Lightly used floors still have air-conditioning and lighting on",
      currentMetric: "Occupancy below 45% for several nights",
      targetMetric: "Reduce kWh per occupied room",
      operationalContext:
        "Front Office assigns rooms across all floors so Engineering cannot set back unused floors.",
    });

    expect(sources[0].documentTitle).toBe("Energy and HVAC Operations SOP");
    expect(sources.map((source) => source.sectionRef)).toContain("§2.2");
  });

  it("includes group-wide policy for any department", async () => {
    const { sources } = await search({
      ...base,
      department: "Procurement",
      issue: "Reporting a baseline for supplier packaging KPI",
      currentMetric: "No documented baseline",
      targetMetric: "Define KPI with unit and denominator",
      operationalContext: "KPI baseline and evidence data lineage are unclear.",
    });

    expect(sources.map((source) => source.department)).toContain(
      "All departments",
    );
  });

  it("returns nothing for an off-topic case instead of forcing weak matches", async () => {
    const { sources } = await search({
      ...base,
      department: "Sales & Marketing",
      issue: "Quantum chess tournament scheduling",
      currentMetric: "Seventeen grandmasters",
      targetMetric: "Zero overlapping rounds",
      operationalContext: "Venue acoustics and trophy engraving.",
    });

    expect(sources).toEqual([]);
  });

  it("only ever returns approved documents", async () => {
    await db.execute(
      sql`update knowledge_documents set status = 'draft' where slug = 'food-waste-sop'`,
    );

    const { sources } = await search({
      ...base,
      department: "Food & Beverage",
      issue: "Breakfast buffet croissant waste is high",
      currentMetric: "14% unsold",
      targetMetric: "Below 8%",
      operationalContext: "Large trays of pastry replenished late.",
    });

    expect(
      sources.some((source) => source.documentTitle.startsWith("Food Waste")),
    ).toBe(false);

    await db.execute(
      sql`update knowledge_documents set status = 'approved' where slug = 'food-waste-sop'`,
    );
  });

  it("numbers sources S1..Sn in rank order with scores", async () => {
    const { sources } = await search({
      ...base,
      department: "Housekeeping",
      issue: "Laundry usage above baseline",
      currentMetric: "laundry kg per occupied room",
      targetMetric: "baseline",
      operationalContext: "towel reuse and washer batching",
    });

    expect(sources.map((source) => source.id)).toEqual(
      sources.map((_, index) => `S${index + 1}`),
    );
    expect(sources.map((source) => source.score)).toEqual(
      [...sources.map((source) => source.score)].sort((a, b) => b - a),
    );
  });
});

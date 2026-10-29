import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import { parseKnowledgeDocument } from "@/lib/knowledge/parse";
import {
  knowledgeDraftSchema,
  type KnowledgeDraftInput,
} from "@/lib/schemas/knowledge";
import type { Principal } from "@/features/action-plans/domain/permissions";
import type { Database } from "./db";
import { schema } from "./db";
import { ApiError } from "./api";
import { createPlan, getPlan, listPlans } from "./action-plan-repo";
import { buildGroundedDemoPlans } from "./demo-seed";
import { hashEmbedder, type Embedder } from "./embeddings";
import { ingestDocuments, retrieveSources } from "./knowledge";
import {
  deleteDraft,
  getKnowledgeDocument,
  listKnowledge,
  previewDraft,
  publishDocument,
  resetKnowledgeBase,
  saveDraft,
  updateDraft,
  withdrawDocument,
} from "./knowledge-admin";
import { createTestDb } from "./test-db";
import { recordGeneration } from "./test-support";

const MAYA: Principal = {
  id: "usr_maya_chen",
  name: "Maya Chen",
  role: "sustainability_manager",
  department: null,
};
const DANIEL: Principal = {
  id: "usr_daniel_ortiz",
  name: "Daniel Ortiz",
  role: "reviewer",
  department: null,
};
const PRIYA: Principal = {
  id: "usr_priya_nair",
  name: "Priya Nair",
  role: "department_manager",
  department: "Engineering",
};

const as = (actor: Principal) => ({ requestId: "t", actor });
const CAPS = { userDocumentCap: 20 };
const PUBLISH = { embedder: hashEmbedder, dailyCap: 100 };

const BODY = `## 1. Scope

### 1.1 Applicability
This procedure applies to every guest floor.

### 1.2 Consolidation threshold
Floors are consolidated when forecast occupancy is below 30 percent for five or more consecutive nights.
`;

const newDocument = (overrides: Partial<KnowledgeDraftInput> = {}): KnowledgeDraftInput => ({
  title: "Night Audit Floor Policy",
  department: "Engineering",
  documentType: "policy",
  body: BODY,
  ...overrides,
});

// A new version of the shipped energy SOP, with a different threshold.
const energyV3 = (overrides: Partial<KnowledgeDraftInput> = {}): KnowledgeDraftInput => ({
  documentKey: "energy-hvac-operations-sop",
  title: "ignored for a new version",
  department: "ignored",
  documentType: "sop",
  body: `## 2. Occupancy-based operation

### 2.2 Low-occupancy floor consolidation
When forecast occupancy is below 30 percent for five or more consecutive nights, Front Office assigns rooms by floor so that Engineering can place unused floors in reduced mode.
`,
  ...overrides,
});

async function expectApiError(promise: Promise<unknown>, code: string, status?: number) {
  await expect(promise).rejects.toMatchObject({
    constructor: ApiError,
    code,
    ...(status ? { status } : {}),
  });
}

let db: Database;

function loadCorpus() {
  const directory = path.join(process.cwd(), "knowledge");

  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .map((file) =>
      parseKnowledgeDocument(fs.readFileSync(path.join(directory, file), "utf8"), file),
    );
}

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(
    sql`truncate knowledge_documents, action_plans, audit_events, ai_generations cascade`,
  );
  await ingestDocuments(db, loadCorpus(), hashEmbedder);
});

const energyCase = demoActionPlans[0].sustainabilityCase;

async function retrieved() {
  const result = await retrieveSources(db, energyCase, {
    embedder: hashEmbedder,
    topK: 6,
    minScore: 0.2,
  });

  return result;
}

describe("drafts", () => {
  it("previews how a draft splits into citeable sections, and stores nothing", async () => {
    const before = (await listKnowledge(db)).length;
    const preview = await previewDraft(db, newDocument(), MAYA);

    expect(preview.version).toBe(1);
    expect(preview.sections.map((s) => s.sectionRef)).toEqual(["§1.1", "§1.2"]);
    expect((await listKnowledge(db)).length).toBe(before);
  });

  it("explains what is wrong with a draft in plain words", async () => {
    await expectApiError(
      previewDraft(db, newDocument({ body: "Just some prose, no numbered sections." }), MAYA),
      "invalid_document",
      422,
    );
    await expectApiError(
      previewDraft(
        db,
        newDocument({ body: "### 1.1 A\nText\n### 1.1 B\nMore text" }),
        MAYA,
      ),
      "invalid_document",
      422,
    );
    await expectApiError(
      previewDraft(
        db,
        newDocument({
          body: Array.from({ length: 21 }, (_, i) => `### ${i + 1} Part ${i + 1}\nSome words here.`).join("\n"),
        }),
        MAYA,
      ),
      "invalid_document",
      422,
    );
    await expectApiError(
      previewDraft(db, newDocument({ department: "Imaginary Department" }), MAYA),
      "invalid_document",
      422,
    );
  });

  it("refuses single-line fields that carry a newline (front-matter injection)", () => {
    const result = knowledgeDraftSchema.safeParse(
      newDocument({ title: "Innocent\nstatus: approved" }),
    );

    expect(result.success).toBe(false);
  });

  it("saves a draft that is not retrievable, and only managers may write one", async () => {
    const saved = await saveDraft(db, newDocument(), as(MAYA), CAPS);

    expect(saved.document).toMatchObject({
      status: "draft",
      version: 1,
      origin: "user",
      indexStatus: null,
      chunkCount: 0,
      createdBy: { id: MAYA.id },
    });
    expect(saved.sections).toHaveLength(2);
    expect(saved.markdown).toContain("status: draft");

    for (const actor of [DANIEL, PRIYA]) {
      await expectApiError(saveDraft(db, newDocument({ title: "Other" }), as(actor), CAPS), "forbidden", 403);
    }
  });

  it("writes a new version of an existing document, keeping its identity", async () => {
    const saved = await saveDraft(db, energyV3(), as(MAYA), CAPS);

    expect(saved.document).toMatchObject({
      documentKey: "energy-hvac-operations-sop",
      title: "Energy and HVAC Operations SOP",
      department: "Engineering",
      version: 3, // the shipped SOP is v2
    });
  });

  it("allows one draft per document and refuses a duplicate title", async () => {
    await saveDraft(db, newDocument(), as(MAYA), CAPS);

    await expectApiError(saveDraft(db, newDocument(), as(MAYA), CAPS), "document_exists", 409);

    await saveDraft(db, energyV3(), as(MAYA), CAPS);
    await expectApiError(saveDraft(db, energyV3(), as(MAYA), CAPS), "draft_exists", 409);
  });

  it("edits and deletes drafts, but a published version is immutable", async () => {
    const draft = await saveDraft(db, newDocument(), as(MAYA), CAPS);
    const edited = await updateDraft(
      db,
      draft.document.id,
      newDocument({ body: BODY.replace("30 percent", "35 percent") }),
      as(MAYA),
    );

    expect(edited.sections[1].content).toContain("35 percent");

    await publishDocument(db, draft.document.id, as(DANIEL), PUBLISH);
    await expectApiError(
      updateDraft(db, draft.document.id, newDocument(), as(MAYA)),
      "not_a_draft",
      409,
    );
    await expectApiError(deleteDraft(db, draft.document.id, as(MAYA)), "not_a_draft", 409);

    const another = await saveDraft(db, newDocument({ title: "Scratch" }), as(MAYA), CAPS);
    await deleteDraft(db, another.document.id, as(MAYA));
    await expectApiError(getKnowledgeDocument(db, another.document.id), "document_not_found", 404);
  });

  it("bounds how many documents can be written in the app", async () => {
    await saveDraft(db, newDocument({ title: "One" }), as(MAYA), { userDocumentCap: 1 });

    await expectApiError(
      saveDraft(db, newDocument({ title: "Two" }), as(MAYA), { userDocumentCap: 1 }),
      "knowledge_cap_reached",
      429,
    );
  });
});

describe("publishing", () => {
  it("embeds the sections, approves the document, and records who and when", async () => {
    const draft = await saveDraft(db, newDocument(), as(MAYA), CAPS);
    const published = await publishDocument(db, draft.document.id, as(DANIEL), PUBLISH);

    expect(published.document).toMatchObject({
      status: "approved",
      indexStatus: "available",
      chunkCount: 2,
      approvedBy: { id: DANIEL.id },
    });
    expect(published.document.approvedAt).not.toBeNull();

    const chunks = await db
      .select()
      .from(schema.knowledgeChunks)
      .where(eq(schema.knowledgeChunks.documentId, draft.document.id));

    expect(chunks.every((chunk) => chunk.embeddingModel === hashEmbedder.model)).toBe(true);
  });

  it("is the reviewer's decision, never the author's or another manager's", async () => {
    const draft = await saveDraft(db, newDocument(), as(MAYA), CAPS);

    for (const actor of [MAYA, PRIYA]) {
      await expectApiError(publishDocument(db, draft.document.id, as(actor), PUBLISH), "forbidden", 403);
    }

    // Even someone allowed to publish cannot approve their own work.
    await db
      .update(schema.knowledgeDocuments)
      .set({ createdBy: DANIEL.id })
      .where(eq(schema.knowledgeDocuments.id, draft.document.id));
    await expectApiError(
      publishDocument(db, draft.document.id, as(DANIEL), PUBLISH),
      "self_approval_forbidden",
      403,
    );
  });

  it("makes the new version the one retrieval uses, and supersedes the old one", async () => {
    const before = await retrieved();
    expect(before.sources.some((s) => s.documentTitle.includes("Energy") && s.documentVersion === 2)).toBe(true);

    const draft = await saveDraft(db, energyV3(), as(MAYA), CAPS);

    // A draft changes nothing for retrieval.
    expect((await retrieved()).sources.map((s) => s.documentVersion)).not.toContain(3);

    await publishDocument(db, draft.document.id, as(DANIEL), PUBLISH);

    const documents = await listKnowledge(db);
    const energy = documents.filter((d) => d.documentKey === "energy-hvac-operations-sop");

    expect(energy.map((d) => [d.version, d.status]).sort()).toEqual([
      [2, "superseded"],
      [3, "approved"],
    ]);

    const after = await retrieved();
    const energySources = after.sources.filter((s) => s.documentTitle.includes("Energy and HVAC"));

    expect(energySources.length).toBeGreaterThan(0);
    expect(energySources.every((s) => s.documentVersion === 3)).toBe(true);
    expect(energySources.some((s) => /30 percent/.test(s.excerpt))).toBe(true);

    // The retrieval record says why v2 was left out.
    const v2 = after.diagnostics.candidates.filter(
      (c) => c.documentTitle.includes("Energy and HVAC") && c.documentVersion === 2,
    );

    expect(v2.length).toBeGreaterThan(0);
    expect(v2.every((c) => c.decision === "excluded_status")).toBe(true);
  });

  it("leaves a failed publish as a retryable draft, without exposing provider details", async () => {
    const draft = await saveDraft(db, newDocument(), as(MAYA), CAPS);
    const broken: Embedder = {
      model: "hash-v1",
      embed: async () => {
        throw new Error("provider exploded: sk-secret-key-123");
      },
    };

    await expectApiError(
      publishDocument(db, draft.document.id, as(DANIEL), { embedder: broken, dailyCap: 100 }),
      "indexing_failed",
      502,
    );

    const failed = await getKnowledgeDocument(db, draft.document.id);

    expect(failed.document).toMatchObject({ status: "draft", indexStatus: "failed", chunkCount: 0 });
    expect(failed.document.indexError).not.toContain("sk-secret");
    expect((await retrieved()).sources.length).toBeGreaterThan(0);

    // Retrying with a working embedder succeeds.
    const retried = await publishDocument(db, draft.document.id, as(DANIEL), PUBLISH);

    expect(retried.document).toMatchObject({ status: "approved", indexStatus: "available", indexError: null });
  });

  it("refuses a second publish while one is running, but recovers a dead one", async () => {
    const draft = await saveDraft(db, newDocument(), as(MAYA), CAPS);
    const stuck = (minutesAgo: number) =>
      db
        .update(schema.knowledgeDocuments)
        .set({ indexStatus: "processing", updatedAt: new Date(Date.now() - minutesAgo * 60_000) })
        .where(eq(schema.knowledgeDocuments.id, draft.document.id));

    await stuck(1);
    await expectApiError(publishDocument(db, draft.document.id, as(DANIEL), PUBLISH), "already_processing", 409);

    await stuck(10);
    expect((await publishDocument(db, draft.document.id, as(DANIEL), PUBLISH)).document.status).toBe("approved");
  });

  it("caps how often documents can be published in a day", async () => {
    const first = await saveDraft(db, newDocument({ title: "First" }), as(MAYA), CAPS);
    const second = await saveDraft(db, newDocument({ title: "Second" }), as(MAYA), CAPS);

    await publishDocument(db, first.document.id, as(DANIEL), { embedder: hashEmbedder, dailyCap: 1 });
    await expectApiError(
      publishDocument(db, second.document.id, as(DANIEL), { embedder: hashEmbedder, dailyCap: 1 }),
      "knowledge_publish_cap",
      429,
    );
  });
});

describe("withdrawing", () => {
  it("takes an approved document out of retrieval, for a stated reason, reviewers only", async () => {
    const energy = (await listKnowledge(db)).find(
      (d) => d.documentKey === "energy-hvac-operations-sop" && d.status === "approved",
    )!;

    await expectApiError(withdrawDocument(db, energy.id, "Outdated", as(MAYA)), "forbidden", 403);

    const withdrawn = await withdrawDocument(db, energy.id, "Thresholds under review", as(DANIEL));

    expect(withdrawn.document.status).toBe("withdrawn");
    expect((await retrieved()).sources.some((s) => s.documentTitle.includes("Energy and HVAC"))).toBe(false);

    const events = await db.select().from(schema.auditEvents);
    expect(events.find((e) => e.eventType === "knowledge_withdrawn")?.metadata).toMatchObject({
      comment: "Thresholds under review",
    });

    await expectApiError(withdrawDocument(db, energy.id, "Again", as(DANIEL)), "not_approved", 409);
  });
});

describe("plans whose sources changed", () => {
  async function planFromEnergySop() {
    const [seeded] = await buildGroundedDemoPlans(db);
    const generationId = await recordGeneration(db, {
      input: seeded.sustainabilityCase,
      output: seeded.actionPlan!,
    });
    const plan = await createPlan(
      db,
      {
        sustainabilityCase: seeded.sustainabilityCase,
        actionPlan: seeded.actionPlan,
        generationId,
        owner: "Jordan Lee",
        priority: "High",
        targetDate: "2026-12-01",
        nextReviewDate: "2026-11-01",
        readinessChecklist: seeded.readinessChecklist,
        kpiProgress: seeded.kpiProgress,
      },
      as(MAYA),
    );

    return plan;
  }

  it("flags a plan when a document it cites is superseded, naming the new version", async () => {
    const plan = await planFromEnergySop();
    expect(plan.sourceAlerts).toEqual([]);

    const draft = await saveDraft(db, energyV3(), as(MAYA), CAPS);
    await publishDocument(db, draft.document.id, as(DANIEL), PUBLISH);

    const [listed] = await listPlans(db, MAYA);
    expect(listed.sourceAlerts).toEqual([
      expect.objectContaining({
        documentTitle: "Energy and HVAC Operations SOP",
        citedVersion: 2,
        status: "superseded",
        currentVersion: 3,
      }),
    ]);
    expect((await getPlan(db, plan.id, MAYA)).sourceAlerts).toHaveLength(1);

    // The plan itself is untouched: it keeps the sections it was built on.
    expect(listed.actionPlan!.sources[0].documentVersion).toBe(2);
  });

  it("says there is no replacement when the document was withdrawn", async () => {
    const plan = await planFromEnergySop();
    const energy = (await listKnowledge(db)).find(
      (d) => d.documentKey === "energy-hvac-operations-sop" && d.status === "approved",
    )!;

    await withdrawDocument(db, energy.id, "Under review", as(DANIEL));

    expect((await getPlan(db, plan.id, MAYA)).sourceAlerts).toEqual([
      expect.objectContaining({ status: "withdrawn", currentVersion: null }),
    ]);
  });
});

describe("the nightly restore", () => {
  it("removes documents written in the app and restores shipped documents' statuses", async () => {
    const draft = await saveDraft(db, energyV3(), as(MAYA), CAPS);
    await publishDocument(db, draft.document.id, as(DANIEL), PUBLISH);
    await saveDraft(db, newDocument(), as(MAYA), CAPS);

    const sop = (await listKnowledge(db)).find(
      (d) => d.documentKey === "food-waste-sop",
    )!;
    await withdrawDocument(db, sop.id, "Test", as(DANIEL));

    const result = await resetKnowledgeBase(db);

    expect(result.removed).toBe(2);
    expect(result.restored).toBe(2); // energy v2 and the withdrawn food-waste SOP

    const documents = await listKnowledge(db);

    expect(documents.every((d) => d.origin === "corpus")).toBe(true);
    expect(documents.find((d) => d.documentKey === "food-waste-sop")!.status).toBe("approved");
    expect(
      documents.find((d) => d.documentKey === "energy-hvac-operations-sop")!.status,
    ).toBe("approved");
    // Shipped superseded documents stay superseded.
    expect(
      documents.find((d) => d.slug === "housekeeping-resource-efficiency-v1")!.status,
    ).toBe("superseded");
    expect((await retrieved()).sources.some((s) => s.documentVersion === 3)).toBe(false);
  });
});

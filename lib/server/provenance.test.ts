import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { PlanContent } from "@/lib/schemas/action-plan";
import type { Principal } from "@/features/action-plans/domain/permissions";
import { getCaseDrift } from "@/features/action-plans/domain/action-items";
import type { Database } from "./db";
import { schema } from "./db";
import { ApiError } from "./api";
import * as repository from "./action-plan-repo";
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
const demo = demoActionPlans[0];

function content(
  generationId: string | null,
  overrides: Partial<PlanContent> = {},
): PlanContent {
  return {
    sustainabilityCase: demo.sustainabilityCase,
    actionPlan: demo.actionPlan,
    generationId,
    owner: "Jordan Lee",
    priority: "High",
    targetDate: "2026-12-01",
    nextReviewDate: "2026-11-01",
    readinessChecklist: {
      actionsAreSpecific: true,
      kpisAreMeasurable: true,
      ownerAssigned: true,
      timelineDefined: true,
      privacyReviewed: true,
      staffMessageReady: true,
    },
    kpiProgress: { baseline: "", current: "", target: "", latestUpdate: "" },
    ...overrides,
  };
}

async function expectApiError(
  promise: Promise<unknown>,
  code: string,
  status?: number,
) {
  await expect(promise).rejects.toMatchObject({
    constructor: ApiError,
    code,
    ...(status ? { status } : {}),
  });
}

let db: Database;
let generationId: string;

async function version(id: string) {
  const plan = await repository.getPlan(db, id, MAYA);

  return plan.version;
}

const update = async (id: string, next: PlanContent, actor = MAYA) =>
  repository.updatePlan(db, id, next, await version(id), as(actor));
const transition = async (
  id: string,
  event: Parameters<typeof repository.transitionPlanState>[2],
  actor: Principal,
  options: { comment?: string; content?: PlanContent } = {},
) =>
  repository.transitionPlanState(
    db,
    id,
    event,
    { ...options, expectedVersion: await version(id) },
    as(actor),
  );

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(
    sql`truncate action_plans, audit_events, ai_generations cascade`,
  );
  generationId = await recordGeneration(db);
});

describe("a plan's AI provenance comes from the server's record", () => {
  it("stores the generation's own output as the baseline, with the case it answered", async () => {
    const plan = await repository.createPlan(
      db,
      content(generationId),
      as(MAYA),
    );

    expect(plan.originalAiOutput).toEqual(demo.actionPlan);
    expect(plan.generatedCase).toEqual(demo.sustainabilityCase);
    expect(
      plan.actionPlan!.recommendedOperationalActions.every(
        (a) => a.origin === "ai",
      ),
    ).toBe(true);
  });

  it("refuses a plan that differs from what was generated", async () => {
    await expectApiError(
      repository.createPlan(
        db,
        content(generationId, {
          actionPlan: {
            ...demo.actionPlan!,
            situationSummary: "Forged by a client",
          },
        }),
        as(MAYA),
      ),
      "plan_differs_from_generation",
      422,
    );
  });

  it("refuses a generation that does not exist or did not finish", async () => {
    const failed = await recordGeneration(db, { status: "failed" });

    await expectApiError(
      repository.createPlan(db, content(crypto.randomUUID()), as(MAYA)),
      "unknown_generation",
      400,
    );
    await expectApiError(
      repository.createPlan(db, content(failed), as(MAYA)),
      "unknown_generation",
      400,
    );
  });

  it("treats a plan with no generation as the author's own, with no sources or claims", async () => {
    const withClaims = {
      ...demo.actionPlan!,
      recommendedOperationalActions:
        demo.actionPlan!.recommendedOperationalActions.map((item) => ({
          ...item,
          claimType: "policy_requirement" as const,
          evidence: { sourceId: "S1", quote: "A confident forged quotation" },
          sourceIds: ["S1"],
        })),
    };
    const plan = await repository.createPlan(
      db,
      content(null, { actionPlan: withClaims }),
      as(MAYA),
    );

    expect(plan.originalAiOutput).toBeNull();
    expect(plan.generatedCase).toBeNull();
    for (const item of plan.actionPlan!.recommendedOperationalActions) {
      expect(item).toMatchObject({
        origin: "human",
        claimType: "proposal",
        evidence: null,
        sourceIds: [],
      });
    }
  });

  it("refuses edits to the generated text and to detaching the generation", async () => {
    const plan = await repository.createPlan(
      db,
      content(generationId),
      as(MAYA),
    );

    await expectApiError(
      update(
        plan.id,
        content(generationId, {
          actionPlan: {
            ...demo.actionPlan!,
            managerChecklist: ["Quietly rewritten"],
          },
        }),
      ),
      "generated_text_locked",
      422,
    );
    await expectApiError(
      update(plan.id, content(null)),
      "generation_required",
      422,
    );
  });
});

describe("a stale plan", () => {
  const changedCase = {
    ...demo.sustainabilityCase,
    operationalContext:
      "Occupancy has recovered and every floor is now in use.",
  };

  it("is flagged when the case changes, blocks approval, and can be acknowledged by its author", async () => {
    const plan = await repository.createPlan(
      db,
      content(generationId),
      as(MAYA),
    );
    const edited = await update(
      plan.id,
      content(generationId, { sustainabilityCase: changedCase }),
    );

    expect(getCaseDrift(edited)).toBe("drifted");
    await expectApiError(
      transition(plan.id, "approve", DANIEL),
      "needs_reassessment",
      409,
    );

    // A reason is required, the author does it, and a reviewer cannot.
    await expectApiError(
      transition(plan.id, "acknowledge_drift", MAYA),
      "comment_required",
      422,
    );
    await expectApiError(
      transition(plan.id, "acknowledge_drift", DANIEL, {
        comment: "Fine by me",
      }),
      "forbidden",
      403,
    );
    await expectApiError(
      transition(plan.id, "acknowledge_drift", PRIYA, {
        comment: "Fine by me",
      }),
      "forbidden",
      403,
    );

    const acknowledged = await transition(plan.id, "acknowledge_drift", MAYA, {
      comment: "Occupancy recovery does not change the floor-setback steps.",
    });

    expect(getCaseDrift(acknowledged)).toBe("acknowledged");
    expect((await transition(plan.id, "approve", DANIEL)).approved).toBe(true);

    const revisions = await repository.listRevisions(db, plan.id, MAYA);
    expect(revisions.at(-2)).toMatchObject({
      eventType: "drift_acknowledged",
      reason: "Occupancy recovery does not change the floor-setback steps.",
    });
  });

  it("is reopened by a further edit and cleared by regenerating", async () => {
    const plan = await repository.createPlan(
      db,
      content(generationId),
      as(MAYA),
    );
    await update(
      plan.id,
      content(generationId, { sustainabilityCase: changedCase }),
    );
    await transition(plan.id, "acknowledge_drift", MAYA, {
      comment: "Still applies.",
    });

    const reopened = await update(
      plan.id,
      content(generationId, {
        sustainabilityCase: {
          ...changedCase,
          issue: "A different issue altogether",
        },
      }),
    );
    expect(getCaseDrift(reopened)).toBe("drifted");

    // Regenerating for the new case records the case the AI actually saw.
    const regeneratedInput = reopened.sustainabilityCase;
    const regeneration = await recordGeneration(db, {
      input: regeneratedInput,
    });
    const regenerated = await update(
      plan.id,
      content(regeneration, { sustainabilityCase: regeneratedInput }),
    );

    expect(getCaseDrift(regenerated)).toBe("none");
    expect(regenerated.generatedCase).toEqual(regeneratedInput);
  });

  it("cannot be acknowledged when nothing changed", async () => {
    const plan = await repository.createPlan(
      db,
      content(generationId),
      as(MAYA),
    );

    await expectApiError(
      transition(plan.id, "acknowledge_drift", MAYA, {
        comment: "Just in case",
      }),
      "no_drift",
      409,
    );
  });
});

describe("retrieval diagnostics", () => {
  const diagnostics = {
    query: "Engineering. Low occupancy.",
    embeddingModel: "hash-v1",
    topK: 6,
    minScore: 0.2,
    caseDepartment: "Engineering",
    candidates: [
      {
        chunkId: crypto.randomUUID(),
        documentId: crypto.randomUUID(),
        documentTitle: "Energy and HVAC Operations SOP",
        documentVersion: 2,
        documentStatus: "approved",
        department: "Engineering",
        sectionRef: "§2.2",
        heading: "Low-occupancy floor consolidation",
        score: 0.71,
        decision: "kept" as const,
      },
    ],
  };

  it("shows managers and reviewers what retrieval considered for the plan's generation", async () => {
    const recorded = await recordGeneration(db, { diagnostics });
    const plan = await repository.createPlan(db, content(recorded), as(MAYA));

    for (const actor of [MAYA, DANIEL]) {
      const result = await repository.getGenerationDiagnostics(
        db,
        plan.id,
        actor,
      );

      expect(result.diagnostics.candidates[0]).toMatchObject({
        decision: "kept",
        sectionRef: "§2.2",
      });
      expect(result.generation.id).toBe(recorded);
    }

    await expectApiError(
      repository.getGenerationDiagnostics(db, plan.id, PRIYA),
      "forbidden",
      403,
    );
  });

  it("says plainly when there is nothing to show", async () => {
    const withoutRecord = await repository.createPlan(
      db,
      content(generationId),
      as(MAYA),
    );
    const human = await repository.createPlan(db, content(null), as(MAYA));

    await expectApiError(
      repository.getGenerationDiagnostics(db, withoutRecord.id, MAYA),
      "no_diagnostics",
      404,
    );
    await expectApiError(
      repository.getGenerationDiagnostics(db, human.id, MAYA),
      "no_diagnostics",
      404,
    );
  });
});

describe("seeded demo plans", () => {
  it("carry verified claims and one visible downgrade, and no drift", async () => {
    // Seeding goes through the same quotation check as a real generation.
    const { buildGroundedDemoPlans } = await import("./demo-seed");
    const { ingestDocuments } = await import("./knowledge");
    const { hashEmbedder } = await import("./embeddings");
    const { parseKnowledgeDocument } = await import("@/lib/knowledge/parse");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const directory = path.join(process.cwd(), "knowledge");
    const documents = fs
      .readdirSync(directory)
      .filter((file) => file.endsWith(".md") && file !== "README.md")
      .map((file) =>
        parseKnowledgeDocument(
          fs.readFileSync(path.join(directory, file), "utf8"),
          file,
        ),
      );

    await ingestDocuments(db, documents, hashEmbedder);

    const plans = await buildGroundedDemoPlans(db);
    const claims = plans.flatMap((plan) =>
      plan.actionPlan!.recommendedOperationalActions.map((action) => ({
        action,
        sources: plan.actionPlan!.sources,
      })),
    );
    const verified = claims.filter(
      ({ action }) => action.claimType === "policy_requirement",
    );
    const downgraded = claims.filter(
      ({ action }) => action.downgradeReason !== null,
    );

    expect(verified.length).toBeGreaterThanOrEqual(6);
    for (const { action, sources } of verified) {
      // Each verified quotation is in a source that this very action cites.
      const source = sources.find((s) => s.id === action.evidence!.sourceId);

      expect(action.sourceIds).toContain(source!.id);
      expect(source!.excerpt).toContain(action.evidence!.quote);
    }
    expect(downgraded.map(({ action }) => action.downgradeReason)).toEqual([
      "quote_not_found",
    ]);
    expect(plans.every((plan) => getCaseDrift(plan) === "none")).toBe(true);
    expect(schema.aiGenerations).toBeDefined();
  });
});

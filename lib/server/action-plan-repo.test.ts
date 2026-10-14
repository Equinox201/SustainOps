import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { PlanContent } from "@/lib/schemas/action-plan";
import type { Database } from "./db";
import { schema } from "./db";
import { ApiError } from "./api";
import {
  createPlan,
  deletePlan,
  listAuditEvents,
  listPlans,
  seedDemoPlans,
  transitionPlanState,
  updatePlan,
} from "./action-plan-repo";
import { createTestDb } from "./test-db";

const context = { requestId: "test-request" };

function makeContent(overrides: Partial<PlanContent> = {}): PlanContent {
  const demo = demoActionPlans[0];

  return {
    sustainabilityCase: demo.sustainabilityCase,
    actionPlan: demo.actionPlan,
    generationId: null,
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
    actionNotes: "",
    ...overrides,
  };
}

async function expectApiError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    constructor: ApiError,
    code,
  });
}

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(
    sql`truncate action_plans, audit_events, ai_generations cascade`,
  );
});

describe("action plan repository", () => {
  it("creates a plan and records an audit event in the same step", async () => {
    const plan = await createPlan(db, makeContent(), context);

    expect(plan).toMatchObject({ approved: false, completed: false });
    expect(await listPlans(db)).toHaveLength(1);

    const events = await listAuditEvents(db);
    expect(events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["action_plan_created"]),
    );
    expect(events[0].planId).toBe(plan.id);
  });

  it("refuses to save a plan that has not been generated", async () => {
    await expectApiError(
      createPlan(db, makeContent({ actionPlan: null }), context),
      "not_generated",
    );
    expect(await listPlans(db)).toHaveLength(0);
  });

  it("approves with pending edits and persists both together", async () => {
    const plan = await createPlan(db, makeContent({ owner: "" }), context);

    const approved = await transitionPlanState(
      db,
      plan.id,
      "approve",
      makeContent({ owner: "Priya Nair" }),
      context,
    );

    expect(approved).toMatchObject({
      approved: true,
      owner: "Priya Nair",
      governanceReview: { reviewerStatus: "Approved" },
    });

    const [stored] = await listPlans(db);
    expect(stored).toMatchObject({ approved: true, owner: "Priya Nair" });
  });

  it("rolls back the edit when the transition is refused", async () => {
    const plan = await createPlan(db, makeContent({ owner: "" }), context);

    await expectApiError(
      transitionPlanState(
        db,
        plan.id,
        "approve",
        makeContent({ owner: "", actionNotes: "should not persist" }),
        context,
      ),
      "not_ready",
    );

    const [stored] = await listPlans(db);
    expect(stored.actionNotes).toBe("");
    const events = await listAuditEvents(db);
    expect(events.some((e) => e.eventType === "action_plan_approved")).toBe(
      false,
    );
  });

  it("locks case, owner and AI output once approved", async () => {
    const plan = await createPlan(db, makeContent(), context);
    await transitionPlanState(db, plan.id, "approve", undefined, context);

    await expectApiError(
      updatePlan(db, plan.id, makeContent({ owner: "Someone Else" }), context),
      "plan_locked",
    );
  });

  it("still allows notes and KPI updates while approved, and notes after done", async () => {
    const plan = await createPlan(db, makeContent(), context);
    await transitionPlanState(db, plan.id, "approve", undefined, context);

    const withNotes = await updatePlan(
      db,
      plan.id,
      makeContent({
        actionNotes: "Week 1 briefing complete",
        kpiProgress: {
          baseline: "1,000 kg",
          current: "1,100 kg",
          target: "1,000 kg",
          latestUpdate: "Trending down",
        },
      }),
      context,
    );
    expect(withNotes.actionNotes).toBe("Week 1 briefing complete");

    await transitionPlanState(db, plan.id, "complete", undefined, context);

    await expectApiError(
      updatePlan(
        db,
        plan.id,
        makeContent({
          actionNotes: "Closed out",
          kpiProgress: { baseline: "x", current: "x", target: "x", latestUpdate: "x" },
        }),
        context,
      ),
      "plan_locked",
    );

    const closedNotes = await updatePlan(
      db,
      plan.id,
      makeContent({
        actionNotes: "Closed out",
        kpiProgress: withNotes.kpiProgress,
      }),
      context,
    );
    expect(closedNotes.actionNotes).toBe("Closed out");
  });

  it("resets approval and unlocks editing", async () => {
    const plan = await createPlan(db, makeContent(), context);
    await transitionPlanState(db, plan.id, "approve", undefined, context);
    const reset = await transitionPlanState(
      db,
      plan.id,
      "reset_approval",
      undefined,
      context,
    );

    expect(reset.approved).toBe(false);

    const edited = await updatePlan(
      db,
      plan.id,
      makeContent({ owner: "New Owner" }),
      context,
    );
    expect(edited.owner).toBe("New Owner");
  });

  it("cannot mark a plan completed without approval at the database level", async () => {
    const plan = await createPlan(db, makeContent(), context);

    await expect(
      db
        .update(schema.actionPlans)
        .set({ completed: true })
        .where(eq(schema.actionPlans.id, plan.id)),
    ).rejects.toThrow();
  });

  it("returns 404 for unknown plans", async () => {
    await expectApiError(
      transitionPlanState(db, "missing", "approve", undefined, context),
      "plan_not_found",
    );
  });

  it("rejects an unknown generation id", async () => {
    await expectApiError(
      createPlan(
        db,
        makeContent({ generationId: "00000000-0000-4000-8000-000000000000" }),
        context,
      ),
      "unknown_generation",
    );
  });

  it("deletes a plan but keeps its audit history", async () => {
    const plan = await createPlan(db, makeContent(), context);
    await deletePlan(db, plan.id, context);

    expect(await listPlans(db)).toHaveLength(0);
    const events = await listAuditEvents(db);
    expect(events.map((e) => e.eventType)).toEqual(
      expect.arrayContaining(["action_plan_created", "action_plan_deleted"]),
    );
  });

  it("seeds demo plans once and is idempotent", async () => {
    expect(await seedDemoPlans(db, demoActionPlans, context)).toBe(
      demoActionPlans.length,
    );
    expect(await seedDemoPlans(db, demoActionPlans, context)).toBe(0);
    expect(await listPlans(db)).toHaveLength(demoActionPlans.length);
  });
});

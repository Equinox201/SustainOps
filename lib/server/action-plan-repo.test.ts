import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { PlanContent } from "@/lib/schemas/action-plan";
import type { Principal } from "@/features/action-plans/domain/permissions";
import type { Database } from "./db";
import { schema } from "./db";
import { ApiError } from "./api";
import {
  createPlan,
  deletePlan,
  getPlan,
  getPlanHistory,
  listAuditEvents,
  listPlans,
  seedDemoPlans,
  transitionPlanState,
  updatePlan,
} from "./action-plan-repo";
import { createTestDb } from "./test-db";

// These match the personas seeded by drizzle/0002_seed_demo_users.sql.
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
const TOM: Principal = {
  id: "usr_tom_becker",
  name: "Tom Becker",
  role: "department_manager",
  department: "Food & Beverage",
};

const as = (actor: Principal) => ({ requestId: "test-request", actor });
const NO_EDITS = {};

function makeContent(overrides: Partial<PlanContent> = {}): PlanContent {
  const demo = demoActionPlans[0]; // Engineering

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

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(
    sql`truncate action_plans, audit_events, ai_generations cascade`,
  );
});

describe("plan lifecycle", () => {
  it("creates a plan attributed to its author, with an audit event", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    expect(plan).toMatchObject({
      approved: false,
      createdBy: { id: MAYA.id, name: "Maya Chen" },
    });

    const events = await listAuditEvents(db, MAYA);
    expect(events[0]).toMatchObject({
      eventType: expect.stringMatching(/action_plan_created|action_notes/),
      planId: plan.id,
      actor: { id: MAYA.id },
    });
  });

  it("refuses to save a plan that has not been generated", async () => {
    await expectApiError(
      createPlan(db, makeContent({ actionPlan: null }), as(MAYA)),
      "not_generated",
    );
    expect(await listPlans(db, MAYA)).toHaveLength(0);
  });

  it("records who approved and when", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    const approved = await transitionPlanState(
      db,
      plan.id,
      "approve",
      NO_EDITS,
      as(DANIEL),
    );

    expect(approved).toMatchObject({
      approved: true,
      approvedBy: { id: DANIEL.id, name: "Daniel Ortiz" },
      governanceReview: { reviewerStatus: "Approved" },
    });
    expect(approved.approvedAt).toEqual(expect.any(String));

    const [stored] = await listPlans(db, MAYA);
    expect(stored).toMatchObject({
      approved: true,
      approvedBy: { id: DANIEL.id },
    });
  });

  it("refuses approval until the plan is ready", async () => {
    const plan = await createPlan(db, makeContent({ owner: "" }), as(MAYA));

    await expectApiError(
      transitionPlanState(db, plan.id, "approve", NO_EDITS, as(DANIEL)),
      "not_ready",
      409,
    );
  });

  it("completes with pending notes in one atomic step", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    await transitionPlanState(db, plan.id, "approve", NO_EDITS, as(DANIEL));

    const done = await transitionPlanState(
      db,
      plan.id,
      "complete",
      { content: makeContent({ actionNotes: "All actions delivered" }) },
      as(MAYA),
    );

    expect(done).toMatchObject({
      completed: true,
      actionNotes: "All actions delivered",
    });
  });

  it("rolls back pending edits when the transition is refused", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    // Not approved yet, so completing is refused; the note must not persist.
    await expectApiError(
      transitionPlanState(
        db,
        plan.id,
        "complete",
        { content: makeContent({ owner: "Should Not Persist" }) },
        as(MAYA),
      ),
      "not_approved",
    );

    expect((await getPlan(db, plan.id, MAYA)).owner).toBe("Jordan Lee");
    const events = await listAuditEvents(db, MAYA);
    expect(events.some((e) => e.eventType === "action_plan_completed")).toBe(
      false,
    );
  });

  it("does not let a reviewer smuggle plan edits into a decision", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    await expectApiError(
      transitionPlanState(
        db,
        plan.id,
        "approve",
        { content: makeContent({ owner: "Hijacked" }) },
        as(DANIEL),
      ),
      "forbidden",
      403,
    );

    expect((await getPlan(db, plan.id, MAYA)).approved).toBe(false);
  });

  it("locks case, owner and AI output once approved", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    await transitionPlanState(db, plan.id, "approve", NO_EDITS, as(DANIEL));

    await expectApiError(
      updatePlan(db, plan.id, makeContent({ owner: "Someone Else" }), as(MAYA)),
      "plan_locked",
    );
  });

  it("allows notes and KPIs while approved, and only notes once done", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    await transitionPlanState(db, plan.id, "approve", NO_EDITS, as(DANIEL));

    const kpi = {
      baseline: "1,000 kg",
      current: "1,100 kg",
      target: "1,000 kg",
      latestUpdate: "Trending down",
    };
    const withNotes = await updatePlan(
      db,
      plan.id,
      makeContent({ actionNotes: "Week 1 briefing complete", kpiProgress: kpi }),
      as(MAYA),
    );
    expect(withNotes.actionNotes).toBe("Week 1 briefing complete");

    await transitionPlanState(db, plan.id, "complete", NO_EDITS, as(MAYA));

    await expectApiError(
      updatePlan(
        db,
        plan.id,
        makeContent({
          actionNotes: "Closed out",
          kpiProgress: { ...kpi, current: "changed" },
        }),
        as(MAYA),
      ),
      "plan_locked",
    );

    const closed = await updatePlan(
      db,
      plan.id,
      makeContent({ actionNotes: "Closed out", kpiProgress: kpi }),
      as(MAYA),
    );
    expect(closed.actionNotes).toBe("Closed out");
  });

  it("resets approval, clears the approver, and unlocks editing", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    await transitionPlanState(db, plan.id, "approve", NO_EDITS, as(DANIEL));
    const reset = await transitionPlanState(
      db,
      plan.id,
      "reset_approval",
      NO_EDITS,
      as(DANIEL),
    );

    expect(reset).toMatchObject({
      approved: false,
      approvedBy: null,
      approvedAt: null,
    });

    const edited = await updatePlan(
      db,
      plan.id,
      makeContent({ owner: "New Owner" }),
      as(MAYA),
    );
    expect(edited.owner).toBe("New Owner");
  });

  it("cannot mark a plan completed without approval at the database level", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    await expect(
      db
        .update(schema.actionPlans)
        .set({ completed: true })
        .where(eq(schema.actionPlans.id, plan.id)),
    ).rejects.toThrow();
  });

  it("returns 404 for unknown plans", async () => {
    await expectApiError(
      transitionPlanState(db, "missing", "approve", NO_EDITS, as(DANIEL)),
      "plan_not_found",
      404,
    );
  });

  it("rejects an unknown generation id", async () => {
    await expectApiError(
      createPlan(
        db,
        makeContent({ generationId: "00000000-0000-4000-8000-000000000000" }),
        as(MAYA),
      ),
      "unknown_generation",
    );
  });

  it("deletes a plan but keeps its audit history", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    await deletePlan(db, plan.id, as(MAYA));

    expect(await listPlans(db, MAYA)).toHaveLength(0);
    const events = await listAuditEvents(db, MAYA);
    expect(events.map((e) => e.eventType)).toEqual(
      expect.arrayContaining(["action_plan_created", "action_plan_deleted"]),
    );
  });

  it("seeds demo plans once and is idempotent", async () => {
    expect(await seedDemoPlans(db, demoActionPlans, as(MAYA))).toBe(
      demoActionPlans.length,
    );
    expect(await seedDemoPlans(db, demoActionPlans, as(MAYA))).toBe(0);
    expect(await listPlans(db, MAYA)).toHaveLength(demoActionPlans.length);
  });
});

describe("review: request changes", () => {
  it("requires a comment", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    await expectApiError(
      transitionPlanState(db, plan.id, "request_changes", NO_EDITS, as(DANIEL)),
      "comment_required",
    );
  });

  it("marks the plan Needs Revision and records the comment in history", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    const returned = await transitionPlanState(
      db,
      plan.id,
      "request_changes",
      { comment: "KPIs are not measurable yet." },
      as(DANIEL),
    );

    expect(returned).toMatchObject({
      approved: false,
      reviewStatus: "changes_requested",
      reviewComment: "KPIs are not measurable yet.",
      governanceReview: { reviewerStatus: "Needs Revision" },
    });

    const history = await getPlanHistory(db, plan.id, MAYA);
    expect(history.at(-1)).toMatchObject({
      eventType: "changes_requested",
      actor: { name: "Daniel Ortiz" },
      comment: "KPIs are not measurable yet.",
    });
  });

  it("clears the request when the author revises the plan", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    await transitionPlanState(
      db,
      plan.id,
      "request_changes",
      { comment: "Add a measurable KPI." },
      as(DANIEL),
    );

    const revised = await updatePlan(
      db,
      plan.id,
      makeContent({ priority: "Low" }),
      as(MAYA),
    );

    expect(revised).toMatchObject({
      reviewStatus: "none",
      reviewComment: null,
      governanceReview: { reviewerStatus: "Pending" },
    });
  });
});

describe("authorization", () => {
  it("only sustainability managers can create plans", async () => {
    for (const actor of [DANIEL, PRIYA]) {
      await expectApiError(
        createPlan(db, makeContent(), as(actor)),
        "forbidden",
        403,
      );
    }
  });

  it("only reviewers can approve", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    for (const actor of [MAYA, PRIYA]) {
      await expectApiError(
        transitionPlanState(db, plan.id, "approve", NO_EDITS, as(actor)),
        "forbidden",
        403,
      );
    }

    expect((await getPlan(db, plan.id, MAYA)).approved).toBe(false);
  });

  it("reviewers cannot edit plan content or close plans out", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    await expectApiError(
      updatePlan(db, plan.id, makeContent({ owner: "Hijacked" }), as(DANIEL)),
      "forbidden",
      403,
    );

    await transitionPlanState(db, plan.id, "approve", NO_EDITS, as(DANIEL));
    await expectApiError(
      transitionPlanState(db, plan.id, "complete", NO_EDITS, as(DANIEL)),
      "forbidden",
      403,
    );
  });

  it("department managers can add notes and KPIs, but not edit the plan", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA)); // Engineering
    await transitionPlanState(db, plan.id, "approve", NO_EDITS, as(DANIEL));

    const updated = await updatePlan(
      db,
      plan.id,
      makeContent({
        actionNotes: "Floor 7 shutdown piloted",
        kpiProgress: {
          baseline: "100",
          current: "92",
          target: "85",
          latestUpdate: "Down 8%",
        },
      }),
      as(PRIYA),
    );
    expect(updated.actionNotes).toBe("Floor 7 shutdown piloted");

    await expectApiError(
      updatePlan(
        db,
        plan.id,
        makeContent({
          actionNotes: "Floor 7 shutdown piloted",
          kpiProgress: updated.kpiProgress,
          owner: "Someone Else",
        }),
        as(PRIYA),
      ),
      "forbidden",
      403,
    );
  });

  it("department managers only see their own department", async () => {
    const engineering = await createPlan(db, makeContent(), as(MAYA));
    const foodAndBeverage = await createPlan(
      db,
      makeContent({
        sustainabilityCase: {
          ...demoActionPlans[1].sustainabilityCase,
        },
      }),
      as(MAYA),
    );

    expect((await listPlans(db, PRIYA)).map((p) => p.id)).toEqual([
      engineering.id,
    ]);
    expect((await listPlans(db, TOM)).map((p) => p.id)).toEqual([
      foodAndBeverage.id,
    ]);
    expect(await listPlans(db, MAYA)).toHaveLength(2);

    // Out-of-scope plans look like they do not exist.
    await expectApiError(
      getPlan(db, foodAndBeverage.id, PRIYA),
      "plan_not_found",
      404,
    );
    await expectApiError(
      updatePlan(
        db,
        foodAndBeverage.id,
        makeContent({
          sustainabilityCase: demoActionPlans[1].sustainabilityCase,
          actionNotes: "snooping",
        }),
        as(PRIYA),
      ),
      "plan_not_found",
      404,
    );
    await expectApiError(
      getPlanHistory(db, foodAndBeverage.id, PRIYA),
      "plan_not_found",
      404,
    );
  });

  it("department managers cannot read the organisation audit log", async () => {
    await expectApiError(listAuditEvents(db, PRIYA), "forbidden", 403);
  });

  it("only sustainability managers can delete", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    for (const actor of [DANIEL, PRIYA]) {
      await expectApiError(
        deletePlan(db, plan.id, as(actor)),
        "forbidden",
        403,
      );
    }

    expect(await listPlans(db, MAYA)).toHaveLength(1);
  });
});

import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { PlanContent, StoredAction } from "@/lib/schemas/action-plan";
import type { Principal } from "@/features/action-plans/domain/permissions";
import type { Database } from "./db";
import { schema } from "./db";
import { ApiError } from "./api";
import * as repository from "./action-plan-repo";
import {
  createPlan,
  deletePlan,
  getPlan,
  getPlanHistory,
  listAuditEvents,
  listPlans,
  replaceDemoPlans,
  seedDemoPlans,
} from "./action-plan-repo";
import { createTestDb } from "./test-db";
import { recordGeneration } from "./test-support";

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

/** Returns content whose `index`th action has `patch` applied. */
function editAction(
  content: PlanContent,
  index: number,
  patch: Partial<StoredAction>,
): PlanContent {
  const plan = content.actionPlan!;

  return {
    ...content,
    actionPlan: {
      ...plan,
      recommendedOperationalActions: plan.recommendedOperationalActions.map(
        (item, position) => (position === index ? { ...item, ...patch } : item),
      ),
    },
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
// A recorded generation of the Engineering demo plan: plans built from
// makeContent() come from it, so they carry AI provenance like real ones.
let generationId: string;

/** The plan's current version, as a client that just loaded it would send. */
async function currentVersion(id: string) {
  const [row] = await db
    .select({ version: schema.actionPlans.version })
    .from(schema.actionPlans)
    .where(eq(schema.actionPlans.id, id));

  return row?.version ?? 1;
}

// Most tests are about rules other than concurrency, so they act on the
// freshest copy. Tests of stale writes call the repository directly.
const updatePlan = async (
  database: Database,
  id: string,
  content: PlanContent,
  context: ReturnType<typeof as>,
) =>
  repository.updatePlan(
    database,
    id,
    content,
    await currentVersion(id),
    context,
  );

const transitionPlanState = async (
  database: Database,
  id: string,
  event: Parameters<typeof repository.transitionPlanState>[2],
  options: { content?: PlanContent; comment?: string },
  context: ReturnType<typeof as>,
) =>
  repository.transitionPlanState(
    database,
    id,
    event,
    { ...options, expectedVersion: await currentVersion(id) },
    context,
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
      { content: editAction(makeContent(), 0, { status: "done" }) },
      as(MAYA),
    );

    expect(done).toMatchObject({ completed: true });
    expect(done.actionPlan!.recommendedOperationalActions[0].status).toBe(
      "done",
    );
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

  it("allows action progress and KPIs while approved, and neither once done", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    await transitionPlanState(db, plan.id, "approve", NO_EDITS, as(DANIEL));

    const kpi = {
      baseline: "1,000 kg",
      current: "1,100 kg",
      target: "1,000 kg",
      latestUpdate: "Trending down",
    };
    const progressed = await updatePlan(
      db,
      plan.id,
      editAction(makeContent({ kpiProgress: kpi }), 0, {
        status: "in_progress",
      }),
      as(MAYA),
    );
    expect(progressed.actionPlan!.recommendedOperationalActions[0].status).toBe(
      "in_progress",
    );

    await transitionPlanState(db, plan.id, "complete", NO_EDITS, as(MAYA));

    await expectApiError(
      updatePlan(
        db,
        plan.id,
        editAction(makeContent({ kpiProgress: kpi }), 0, { status: "done" }),
        as(MAYA),
      ),
      "plan_locked",
    );
    await expectApiError(
      updatePlan(
        db,
        plan.id,
        makeContent({ kpiProgress: { ...kpi, current: "changed" } }),
        as(MAYA),
      ),
      "plan_locked",
    );
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

describe("audit accuracy", () => {
  it("does not log KPI changes that did not happen", async () => {
    const kpi = {
      baseline: "1,000 kg",
      current: "1,100 kg",
      target: "1,000 kg",
      latestUpdate: "Trending down",
    };
    const plan = await createPlan(
      db,
      makeContent({ kpiProgress: kpi }),
      as(MAYA),
    );

    // An unrelated edit, re-sending the same KPI values. jsonb stores object
    // keys in a different order than they are sent, which once looked like a
    // change.
    await updatePlan(
      db,
      plan.id,
      makeContent({ priority: "Low", kpiProgress: kpi }),
      as(MAYA),
    );

    const history = await getPlanHistory(db, plan.id, MAYA);
    const count = (type: string) =>
      history.filter((event) => event.eventType === type).length;

    expect(count("kpi_progress_updated")).toBe(1); // only on creation
    expect(count("action_plan_updated")).toBe(1);
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

  it("is not cleared by editing the plan; only resubmitting answers it", async () => {
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
      reviewStatus: "changes_requested",
      reviewComment: "Add a measurable KPI.",
    });
    // And it cannot be approved around.
    await expectApiError(
      transitionPlanState(db, plan.id, "approve", NO_EDITS, as(DANIEL)),
      "changes_pending",
      409,
    );
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

  it("department managers can track progress and KPIs, but not edit the plan", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA)); // Engineering
    await transitionPlanState(db, plan.id, "approve", NO_EDITS, as(DANIEL));

    const updated = await updatePlan(
      db,
      plan.id,
      editAction(
        makeContent({
          kpiProgress: {
            baseline: "100",
            current: "92",
            target: "85",
            latestUpdate: "Down 8%",
          },
        }),
        0,
        { status: "in_progress" },
      ),
      as(PRIYA),
    );
    expect(updated.actionPlan!.recommendedOperationalActions[0].status).toBe(
      "in_progress",
    );

    await expectApiError(
      updatePlan(
        db,
        plan.id,
        editAction(
          makeContent({
            kpiProgress: updated.kpiProgress,
            owner: "Someone Else",
          }),
          0,
          { status: "in_progress" },
        ),
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
          owner: "snooping",
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

describe("demo reset", () => {
  it("replaces everything with the demo plans and keeps generation records", async () => {
    await createPlan(db, makeContent(), as(MAYA));
    await createPlan(db, makeContent({ owner: "Another" }), as(MAYA));
    await db.insert(schema.aiGenerations).values({
      requestId: "r",
      clientKey: "k",
      model: "m",
      promptVersion: "v",
    });

    const result = await replaceDemoPlans(db, demoActionPlans, {
      requestId: "reset-1",
      actorUserId: MAYA.id,
      trigger: "manual",
    });

    expect(result).toEqual({ removed: 2, restored: demoActionPlans.length });

    const plans = await listPlans(db, MAYA);
    expect(plans.map((plan) => plan.id).sort()).toEqual(
      demoActionPlans.map((plan) => plan.id).sort(),
    );

    // History is wiped except for the record of the reset itself.
    const events = await listAuditEvents(db, MAYA);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "demo_reset",
      actor: { id: MAYA.id },
    });

    // Rate limiting depends on these surviving the reset.
    const generations = await db.select().from(schema.aiGenerations);
    expect(generations).toHaveLength(2); // the fixture's plus the one inserted above
  });

  it("records scheduled resets without a user", async () => {
    await replaceDemoPlans(db, demoActionPlans, {
      requestId: null,
      actorUserId: null,
      trigger: "scheduled",
    });

    const [event] = await listAuditEvents(db, MAYA);
    expect(event).toMatchObject({ eventType: "demo_reset", actor: null });
  });

  it("is atomic: a failure leaves existing plans untouched", async () => {
    await createPlan(db, makeContent(), as(MAYA));

    const broken = [
      ...demoActionPlans,
      { ...demoActionPlans[0] }, // duplicate primary key
    ];

    await expect(
      replaceDemoPlans(db, broken, {
        requestId: null,
        actorUserId: null,
        trigger: "scheduled",
      }),
    ).rejects.toThrow();

    expect(await listPlans(db, MAYA)).toHaveLength(1);
  });
});

describe("concurrent edits", () => {
  it("starts at version 1 and increments on every write", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    expect(plan.version).toBe(1);

    const edited = await repository.updatePlan(
      db,
      plan.id,
      makeContent({ priority: "Low" }),
      1,
      as(MAYA),
    );
    expect(edited.version).toBe(2);

    const approved = await repository.transitionPlanState(
      db,
      plan.id,
      "approve",
      { expectedVersion: 2 },
      as(DANIEL),
    );
    expect(approved.version).toBe(3);
  });

  it("rejects a save made against an out-of-date copy and changes nothing", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    // Priya's colleague saves first...
    await repository.updatePlan(
      db,
      plan.id,
      makeContent({ priority: "Low" }),
      1,
      as(MAYA),
    );

    // ...so a save still based on version 1 must not overwrite it.
    await expectApiError(
      repository.updatePlan(
        db,
        plan.id,
        makeContent({ priority: "High", owner: "Overwritten" }),
        1,
        as(MAYA),
      ),
      "stale_write",
      409,
    );

    const stored = await getPlan(db, plan.id, MAYA);
    expect(stored).toMatchObject({
      priority: "Low",
      owner: "Jordan Lee",
      version: 2,
    });
  });

  it("reports the current version so the client can recover", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    await repository.updatePlan(
      db,
      plan.id,
      makeContent({ priority: "Low" }),
      1,
      as(MAYA),
    );

    await expect(
      repository.updatePlan(db, plan.id, makeContent(), 1, as(MAYA)),
    ).rejects.toMatchObject({
      details: { currentVersion: 2, yourVersion: 1 },
    });
  });

  it("rejects a stale approval, so a reviewer cannot approve unseen edits", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));
    // The reviewer loaded version 1; the author then changes the plan.
    await repository.updatePlan(
      db,
      plan.id,
      makeContent({ owner: "Changed After Review Started" }),
      1,
      as(MAYA),
    );

    await expectApiError(
      repository.transitionPlanState(
        db,
        plan.id,
        "approve",
        { expectedVersion: 1 },
        as(DANIEL),
      ),
      "stale_write",
      409,
    );
    expect((await getPlan(db, plan.id, MAYA)).approved).toBe(false);
  });

  it("lets exactly one of two simultaneous saves win", async () => {
    const plan = await createPlan(db, makeContent(), as(MAYA));

    const results = await Promise.allSettled([
      repository.updatePlan(
        db,
        plan.id,
        makeContent({ priority: "Low" }),
        1,
        as(MAYA),
      ),
      repository.updatePlan(
        db,
        plan.id,
        makeContent({ priority: "Medium" }),
        1,
        as(MAYA),
      ),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await getPlan(db, plan.id, MAYA)).version).toBe(2);
  });
});

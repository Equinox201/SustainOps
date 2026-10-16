import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { PlanContent, StoredAction } from "@/lib/schemas/action-plan";
import type { Principal } from "@/features/action-plans/domain/permissions";
import type { Database } from "./db";
import { schema } from "./db";
import { ApiError } from "./api";
import * as repository from "./action-plan-repo";
import { createTestDb } from "./test-db";

// Personas seeded by drizzle/0002_seed_demo_users.sql.
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
    ...overrides,
  };
}

function withActions(
  content: PlanContent,
  change: (items: StoredAction[]) => StoredAction[],
): PlanContent {
  const plan = content.actionPlan!;

  return {
    ...content,
    actionPlan: {
      ...plan,
      recommendedOperationalActions: change(plan.recommendedOperationalActions),
    },
  };
}

const editAction = (
  content: PlanContent,
  index: number,
  patch: Partial<StoredAction>,
) =>
  withActions(content, (items) =>
    items.map((item, position) =>
      position === index ? { ...item, ...patch } : item,
    ),
  );

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

async function version(id: string) {
  const [row] = await db
    .select({ version: schema.actionPlans.version })
    .from(schema.actionPlans)
    .where(eq(schema.actionPlans.id, id));

  return row.version;
}

// Acts on the freshest copy; concurrency has its own tests elsewhere.
const update = async (id: string, content: PlanContent, actor: Principal) =>
  repository.updatePlan(db, id, content, await version(id), as(actor));

const transition = async (
  id: string,
  event: Parameters<typeof repository.transitionPlanState>[2],
  actor: Principal,
  options: {
    content?: PlanContent;
    comment?: string;
    responses?: { requestId: string; response: string }[];
  } = {},
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
});

describe("revisions", () => {
  it("records a snapshot for every version, in the same transaction", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));
    await update(plan.id, makeContent({ priority: "Low" }), MAYA);
    await transition(plan.id, "approve", DANIEL);

    const revisions = await repository.listRevisions(db, plan.id, MAYA);

    expect(revisions.map((r) => r.version)).toEqual([1, 2, 3]);
    expect(revisions.map((r) => r.eventType)).toEqual([
      "action_plan_created",
      "action_plan_updated",
      "action_plan_approved",
    ]);
    expect(revisions[2].actor).toMatchObject({ id: DANIEL.id });

    const second = await repository.getRevision(db, plan.id, 2, MAYA);
    expect(second.snapshot).toMatchObject({ priority: "Low", approved: false });
    const third = await repository.getRevision(db, plan.id, 3, MAYA);
    expect(third.snapshot).toMatchObject({ priority: "Low", approved: true });
  });

  it("leaves no revision behind when the change is refused", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));

    await expectApiError(
      transition(plan.id, "complete", MAYA), // not approved
      "not_approved",
    );

    const revisions = await repository.listRevisions(db, plan.id, MAYA);
    expect(revisions).toHaveLength(1);
    expect(await version(plan.id)).toBe(1);
  });

  it("pins the version that was approved and clears it on reset", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));
    const approved = await transition(plan.id, "approve", DANIEL);

    expect(approved.approvedVersion).toBe(approved.version);

    const snapshot = await repository.getRevision(
      db,
      plan.id,
      approved.approvedVersion!,
      MAYA,
    );
    expect(snapshot.snapshot.approved).toBe(true);

    const reset = await transition(plan.id, "reset_approval", MAYA);
    expect(reset.approvedVersion).toBeNull();
  });

  it("keeps history out of reach of other departments", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA)); // Engineering

    await expectApiError(
      repository.listRevisions(db, plan.id, TOM),
      "plan_not_found",
      404,
    );
    await expectApiError(
      repository.getRevision(db, plan.id, 1, TOM),
      "plan_not_found",
      404,
    );
    await expectApiError(
      repository.getRevision(db, plan.id, 99, MAYA),
      "revision_not_found",
      404,
    );
  });

  it("starts demo plans with a first revision, including after a reset", async () => {
    const actor = as(MAYA);
    await repository.seedDemoPlans(db, demoActionPlans, actor);

    const [first] = await repository.listPlans(db, MAYA);
    expect(await repository.listRevisions(db, first.id, MAYA)).toHaveLength(1);

    await repository.replaceDemoPlans(db, demoActionPlans, {
      requestId: null,
      actorUserId: null,
      trigger: "manual",
    });
    const plans = await repository.listPlans(db, MAYA);
    for (const plan of plans) {
      expect(await repository.listRevisions(db, plan.id, MAYA)).toHaveLength(1);
    }
  });
});

describe("actions", () => {
  it("keeps the AI's original output untouched while people edit", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));
    const original = plan.originalAiOutput!.recommendedOperationalActions;

    const edited = await update(
      plan.id,
      editAction(makeContent(), 0, { action: "Reworded by a person" }),
      MAYA,
    );

    expect(edited.actionPlan!.recommendedOperationalActions[0].action).toBe(
      "Reworded by a person",
    );
    expect(edited.originalAiOutput!.recommendedOperationalActions).toEqual(
      original,
    );
    expect(original[0].action).not.toBe("Reworded by a person");
  });

  it("decides origin on the server: new actions are human, claims are ignored", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));
    const [first] = plan.actionPlan!.recommendedOperationalActions;

    const added = await update(
      plan.id,
      withActions(makeContent(), (items) => [
        // Claims to be AI-generated; it is new, so it is human.
        {
          ...first,
          id: crypto.randomUUID(),
          action: "Add a shift-start checklist",
          origin: "ai",
        },
        ...items.map((item) => ({ ...item, origin: "human" as const })), // lies about existing ones
      ]),
      MAYA,
    );
    const items = added.actionPlan!.recommendedOperationalActions;

    expect(items[0]).toMatchObject({ origin: "human" });
    expect(items.slice(1).every((item) => item.origin === "ai")).toBe(true);
  });

  it("moves the baseline only when the AI produces a new plan", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));
    const [generation] = await db
      .insert(schema.aiGenerations)
      .values({
        requestId: "r1",
        clientKey: "k1",
        model: "test",
        promptVersion: "test",
        status: "succeeded",
      })
      .returning();

    const regenerated = await update(
      plan.id,
      withActions(makeContent({ generationId: generation.id }), (items) =>
        items.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          action: `New: ${item.action}`,
        })),
      ),
      MAYA,
    );

    expect(regenerated.originalAiOutput).toEqual(regenerated.actionPlan);
    expect(
      regenerated.actionPlan!.recommendedOperationalActions.every(
        (item) => item.origin === "ai",
      ),
    ).toBe(true);
  });

  it("rejects duplicate ids, unknown sources and a blocked action with no reason", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));

    await expectApiError(
      update(
        plan.id,
        withActions(makeContent(), (items) => [items[0], { ...items[0] }]),
        MAYA,
      ),
      "invalid_actions",
      422,
    );
    await expectApiError(
      update(
        plan.id,
        editAction(makeContent(), 0, { sourceIds: ["S9"] }),
        MAYA,
      ),
      "unknown_source",
      422,
    );
    await expectApiError(
      update(
        plan.id,
        editAction(makeContent(), 0, { status: "blocked", blockedReason: " " }),
        MAYA,
      ),
      "blocked_reason_required",
      422,
    );
  });

  it("locks what actions say after approval but not their progress", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));
    await transition(plan.id, "approve", DANIEL);

    await expectApiError(
      update(plan.id, editAction(makeContent(), 0, { action: "Sneaky" }), MAYA),
      "plan_locked",
    );
    await expectApiError(
      update(
        plan.id,
        withActions(makeContent(), (items) => items.slice(1)),
        MAYA,
      ),
      "plan_locked",
    );

    const progressed = await update(
      plan.id,
      editAction(makeContent(), 0, {
        status: "blocked",
        blockedReason: "Waiting on the BMS vendor",
      }),
      PRIYA,
    );
    expect(
      progressed.actionPlan!.recommendedOperationalActions[0],
    ).toMatchObject({
      status: "blocked",
      blockedReason: "Waiting on the BMS vendor",
    });
  });

  it("clears a blocked reason when the action is no longer blocked", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));
    await update(
      plan.id,
      editAction(makeContent(), 0, {
        status: "blocked",
        blockedReason: "No access",
      }),
      MAYA,
    );
    const resumed = await update(
      plan.id,
      editAction(makeContent(), 0, {
        status: "in_progress",
        blockedReason: "stale text",
      }),
      MAYA,
    );

    expect(resumed.actionPlan!.recommendedOperationalActions[0]).toMatchObject({
      status: "in_progress",
      blockedReason: "",
    });
  });
});

describe("assignees", () => {
  it("accepts a manager or a department manager of the plan's department", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA)); // Engineering
    const saved = await update(
      plan.id,
      editAction(makeContent(), 0, {
        assigneeId: PRIYA.id,
        dueDate: "2026-11-15",
      }),
      MAYA,
    );

    expect(saved.actionPlan!.recommendedOperationalActions[0]).toMatchObject({
      assigneeId: PRIYA.id,
      dueDate: "2026-11-15",
    });
    await update(
      plan.id,
      editAction(makeContent(), 0, { assigneeId: MAYA.id }),
      MAYA,
    );
  });

  it("refuses reviewers, other departments and people who do not exist", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA)); // Engineering

    for (const assigneeId of [DANIEL.id, TOM.id, "usr_nobody"]) {
      await expectApiError(
        update(plan.id, editAction(makeContent(), 0, { assigneeId }), MAYA),
        "invalid_assignee",
        422,
      );
    }
  });

  it("does not let a department manager assign work", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));

    await expectApiError(
      update(
        plan.id,
        editAction(makeContent(), 0, { assigneeId: PRIYA.id }),
        PRIYA,
      ),
      "forbidden",
      403,
    );
  });
});

describe("change requests and resubmission", () => {
  async function requested(comments: string[]) {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));

    for (const comment of comments) {
      await transition(plan.id, "request_changes", DANIEL, { comment });
    }

    return repository.getPlan(db, plan.id, MAYA);
  }

  it("keeps every request open until it is answered", async () => {
    const plan = await requested(["Add a KPI.", "Name an owner per action."]);

    expect(plan.reviewStatus).toBe("changes_requested");
    expect(plan.changeRequests).toHaveLength(2);
    expect(plan.changeRequests.every((r) => r.status === "open")).toBe(true);
    expect(plan.changeRequests[0].requestedBy).toMatchObject({ id: DANIEL.id });
  });

  it("requires a response to each open request", async () => {
    const plan = await requested(["Add a KPI.", "Name an owner per action."]);
    const [first] = plan.changeRequests;

    await expectApiError(
      transition(plan.id, "resubmit", MAYA, { responses: [] }),
      "responses_incomplete",
      422,
    );
    await expectApiError(
      transition(plan.id, "resubmit", MAYA, {
        responses: [{ requestId: first.id, response: "Added." }],
      }),
      "responses_incomplete",
      422,
    );
    // A refused resubmission changes nothing.
    expect((await repository.getPlan(db, plan.id, MAYA)).reviewStatus).toBe(
      "changes_requested",
    );
  });

  it("records the responses, clears the status, and then allows approval", async () => {
    const plan = await requested(["Add a KPI.", "Name an owner per action."]);

    const resubmitted = await transition(plan.id, "resubmit", MAYA, {
      responses: plan.changeRequests.map((request, index) => ({
        requestId: request.id,
        response: `Done (${index + 1}).`,
      })),
    });

    expect(resubmitted).toMatchObject({
      reviewStatus: "none",
      reviewComment: null,
    });
    expect(resubmitted.changeRequests.map((r) => r.status)).toEqual([
      "addressed",
      "addressed",
    ]);
    expect(resubmitted.changeRequests[0]).toMatchObject({
      response: "Done (1).",
      respondedBy: { id: MAYA.id },
    });

    const approved = await transition(plan.id, "approve", DANIEL);
    expect(approved.approved).toBe(true);

    const events = await repository.getPlanHistory(db, plan.id, MAYA);
    expect(events.map((e) => e.eventType)).toContain("plan_resubmitted");
  });

  it("can save pending edits atomically with the resubmission", async () => {
    const plan = await requested(["Lower the priority."]);

    const resubmitted = await transition(plan.id, "resubmit", MAYA, {
      content: makeContent({ priority: "Low" }),
      responses: plan.changeRequests.map((request) => ({
        requestId: request.id,
        response: "Lowered to Low.",
      })),
    });

    expect(resubmitted.priority).toBe("Low");
    expect(resubmitted.reviewStatus).toBe("none");
  });

  it("only the author side can resubmit, and only when something is open", async () => {
    const plan = await requested(["Add a KPI."]);
    const [request] = plan.changeRequests;
    const responses = [{ requestId: request.id, response: "Done." }];

    for (const actor of [DANIEL, PRIYA]) {
      await expectApiError(
        transition(plan.id, "resubmit", actor, { responses }),
        "forbidden",
        403,
      );
    }

    await transition(plan.id, "resubmit", MAYA, { responses });
    await expectApiError(
      transition(plan.id, "resubmit", MAYA, { responses }),
      "no_open_request",
      409,
    );
  });
});

describe("notes", () => {
  it("appends attributed notes in order and never changes the plan version", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));
    await transition(plan.id, "approve", DANIEL);
    const before = await version(plan.id);

    await repository.addNote(db, plan.id, "Briefing delivered.", as(PRIYA));
    await repository.addNote(db, plan.id, "Floor 7 piloted.", as(MAYA));

    const notes = await repository.listNotes(db, plan.id, MAYA);

    expect(notes.map((n) => n.body)).toEqual([
      "Briefing delivered.",
      "Floor 7 piloted.",
    ]);
    expect(notes[0].author).toMatchObject({
      id: PRIYA.id,
      role: "department_manager",
    });
    expect(await version(plan.id)).toBe(before);

    const events = await repository.getPlanHistory(db, plan.id, MAYA);
    expect(events.filter((e) => e.eventType === "note_added")).toHaveLength(2);
  });

  it("still accepts notes once the plan is done", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA));
    await transition(plan.id, "approve", DANIEL);
    await transition(plan.id, "complete", MAYA);

    const note = await repository.addNote(
      db,
      plan.id,
      "Lessons learned: start earlier.",
      as(MAYA),
    );
    expect(note.body).toContain("Lessons learned");
  });

  it("respects roles and department scope", async () => {
    const plan = await repository.createPlan(db, makeContent(), as(MAYA)); // Engineering

    await expectApiError(
      repository.addNote(db, plan.id, "Reviewer note", as(DANIEL)),
      "forbidden",
      403,
    );
    await expectApiError(
      repository.addNote(db, plan.id, "Snooping", as(TOM)),
      "plan_not_found",
      404,
    );
    await expectApiError(
      repository.listNotes(db, plan.id, TOM),
      "plan_not_found",
      404,
    );
  });
});

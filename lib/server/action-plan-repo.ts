import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  ActorRef,
  AuditEvent,
  AuditEventType,
  ChangeRequest,
  ChangeResponse,
  PlanNote,
  PlanRevision,
  PlanRevisionSummary,
  Priority,
  RetrievalDiagnostics,
  RevisionSnapshot,
  StoredActionPlan,
} from "@/lib/types";
import {
  aiActionPlanSchema,
  type PlanContent,
} from "@/lib/schemas/action-plan";
import { isEligibleAssignee } from "@/features/action-plans/domain/action-items";
import {
  applyContentUpdate,
  buildGovernanceReview,
  createPlanFromContent,
  lifecycleErrorMessages,
  planToContent,
  transitionPlan,
  type LifecycleError,
  type LifecycleEvent,
  type LifecycleResult,
  type VerifiedGeneration,
} from "@/features/action-plans/domain/lifecycle";
import {
  can,
  canAccessPlan,
  permissionsForContentChange,
  type Permission,
  type Principal,
} from "@/features/action-plans/domain/permissions";
import { deepEqual } from "@/features/action-plans/domain/deep-equal";
import { ApiError } from "./api";
import { schema, type Database } from "./db";
import type { ActionPlanRow } from "./db/schema";

const {
  actionPlanRevisions,
  actionPlans,
  aiGenerations,
  auditEvents,
  changeRequests,
  planNotes,
  users,
} = schema;

export type WriteContext = {
  requestId: string | null;
  actor: Principal;
};

const LIFECYCLE_STATUS: Record<LifecycleError, number> = {
  case_incomplete: 422,
  not_generated: 422,
  comment_required: 422,
  not_ready: 409,
  changes_pending: 409,
  no_open_request: 409,
  responses_incomplete: 422,
  invalid_assignee: 422,
  invalid_actions: 422,
  blank_action: 422,
  needs_reassessment: 409,
  no_drift: 409,
  plan_differs_from_generation: 422,
  generated_text_locked: 422,
  generation_required: 422,
  blocked_reason_required: 422,
  already_approved: 409,
  not_approved: 409,
  already_completed: 409,
  plan_locked: 409,
  self_approval_forbidden: 403,
};

const TRANSITION_AUDIT_EVENT: Record<LifecycleEvent, AuditEventType> = {
  approve: "action_plan_approved",
  request_changes: "changes_requested",
  resubmit: "plan_resubmitted",
  acknowledge_drift: "drift_acknowledged",
  complete: "action_plan_completed",
  reset_approval: "approval_reset",
};

const TRANSITION_PERMISSION: Record<LifecycleEvent, Permission> = {
  approve: "plan:approve",
  request_changes: "plan:request_changes",
  resubmit: "plan:resubmit",
  acknowledge_drift: "plan:edit",
  complete: "plan:complete",
  reset_approval: "plan:reset_approval",
};

const toActorRef = (actor: Principal): ActorRef => ({
  id: actor.id,
  name: actor.name,
  role: actor.role,
});

function unwrap(result: LifecycleResult): StoredActionPlan {
  if (result.ok) {
    return result.plan;
  }

  throw new ApiError(
    LIFECYCLE_STATUS[result.error],
    result.error,
    lifecycleErrorMessages[result.error],
  );
}

function forbidden(permission: Permission) {
  return new ApiError(
    403,
    "forbidden",
    "Your role is not allowed to do this.",
    { permission },
  );
}

function requirePermission(
  actor: Principal,
  permission: Permission,
  plan?: { sustainabilityCase: { department: string } },
) {
  if (!can(actor, permission, plan)) {
    throw forbidden(permission);
  }
}

type UserRefs = Map<string, ActorRef>;

async function loadUserRefs(db: Database): Promise<UserRefs> {
  const rows = await db.select().from(users);

  return new Map(
    rows.map((row) => [
      row.id,
      { id: row.id, name: row.name, role: row.role as ActorRef["role"] },
    ]),
  );
}

function rowToPlan(
  row: ActionPlanRow,
  refs: UserRefs,
  requests: ChangeRequest[] = [],
): StoredActionPlan {
  const reviewStatus = row.reviewStatus as StoredActionPlan["reviewStatus"];

  return {
    id: row.id,
    title: row.title,
    sustainabilityCase: {
      property: row.property,
      department: row.department,
      issue: row.issue,
      currentMetric: row.currentMetric,
      targetMetric: row.targetMetric,
      operationalContext: row.operationalContext,
    },
    actionPlan: row.actionPlan,
    generationId: row.generationId,
    governanceReview: buildGovernanceReview({
      approved: row.approved,
      completed: row.completed,
      changesRequested: reviewStatus === "changes_requested",
      generatedAt: (row.generatedAt ?? row.createdAt).toISOString(),
    }),
    owner: row.owner,
    priority: row.priority as Priority,
    targetDate: row.targetDate ?? "",
    nextReviewDate: row.nextReviewDate ?? "",
    readinessChecklist: row.readinessChecklist,
    kpiProgress: row.kpiProgress,
    version: row.version,
    approvedVersion: row.approvedVersion,
    originalAiOutput: row.originalAiOutput,
    generatedCase: row.generatedCase,
    driftAcknowledged: row.driftAcknowledged,
    changeRequests: requests,
    approved: row.approved,
    completed: row.completed,
    reviewStatus,
    reviewComment: row.reviewComment,
    createdBy: row.createdBy ? (refs.get(row.createdBy) ?? null) : null,
    approvedBy: row.approvedBy ? (refs.get(row.approvedBy) ?? null) : null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function planToRow(plan: StoredActionPlan): typeof actionPlans.$inferInsert {
  return {
    id: plan.id,
    title: plan.title,
    property: plan.sustainabilityCase.property,
    department: plan.sustainabilityCase.department,
    issue: plan.sustainabilityCase.issue,
    currentMetric: plan.sustainabilityCase.currentMetric,
    targetMetric: plan.sustainabilityCase.targetMetric,
    operationalContext: plan.sustainabilityCase.operationalContext,
    actionPlan: plan.actionPlan,
    generationId: plan.generationId,
    generatedAt: new Date(plan.governanceReview.auditTimestamp),
    owner: plan.owner,
    priority: plan.priority,
    targetDate: plan.targetDate || null,
    nextReviewDate: plan.nextReviewDate || null,
    readinessChecklist: plan.readinessChecklist,
    kpiProgress: plan.kpiProgress,
    originalAiOutput: plan.originalAiOutput,
    approvedVersion: plan.approvedVersion,
    generatedCase: plan.generatedCase,
    driftAcknowledged: plan.driftAcknowledged,
    version: plan.version,
    approved: plan.approved,
    completed: plan.completed,
    reviewStatus: plan.reviewStatus,
    reviewComment: plan.reviewComment,
    createdBy: plan.createdBy?.id ?? null,
    approvedBy: plan.approvedBy?.id ?? null,
    approvedAt: plan.approvedAt ? new Date(plan.approvedAt) : null,
    createdAt: new Date(plan.createdAt),
    updatedAt: new Date(plan.updatedAt),
  };
}

async function recordAudit(
  db: Database,
  context: WriteContext,
  event: {
    eventType: AuditEventType;
    planId: string | null;
    department: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(auditEvents).values({
    eventType: event.eventType,
    planId: event.planId,
    department: event.department,
    actorUserId: context.actor.id,
    actorRole: context.actor.role,
    requestId: context.requestId,
    metadata: event.metadata ?? null,
  });
}

/** Change requests for the given plans, oldest first, grouped by plan. */
async function loadChangeRequests(
  db: Database,
  planIds: string[],
  refs: UserRefs,
): Promise<Map<string, ChangeRequest[]>> {
  const grouped = new Map<string, ChangeRequest[]>();

  if (planIds.length === 0) {
    return grouped;
  }

  const rows = await db
    .select()
    .from(changeRequests)
    .where(inArray(changeRequests.planId, planIds))
    .orderBy(asc(changeRequests.requestedAt), asc(changeRequests.id));
  const fallback: ActorRef = {
    id: "unknown",
    name: "Unknown",
    role: "reviewer",
  };

  for (const row of rows) {
    const list = grouped.get(row.planId) ?? [];

    list.push({
      id: row.id,
      comment: row.comment,
      status: row.status as ChangeRequest["status"],
      requestedBy:
        (row.requestedBy ? refs.get(row.requestedBy) : undefined) ?? fallback,
      requestedAt: row.requestedAt.toISOString(),
      response: row.response,
      respondedBy: row.respondedBy ? (refs.get(row.respondedBy) ?? null) : null,
      respondedAt: row.respondedAt?.toISOString() ?? null,
    });
    grouped.set(row.planId, list);
  }

  return grouped;
}

/** The content of a plan as a revision records it. */
function toSnapshot(plan: StoredActionPlan): RevisionSnapshot {
  return {
    sustainabilityCase: plan.sustainabilityCase,
    actionPlan: plan.actionPlan,
    owner: plan.owner,
    priority: plan.priority,
    targetDate: plan.targetDate,
    nextReviewDate: plan.nextReviewDate,
    readinessChecklist: plan.readinessChecklist,
    kpiProgress: plan.kpiProgress,
    approved: plan.approved,
    completed: plan.completed,
    reviewStatus: plan.reviewStatus,
    reviewComment: plan.reviewComment,
  };
}

/** Records the plan as it now stands, in the transaction that changed it. */
async function writeRevision(
  db: Database,
  plan: StoredActionPlan,
  event: {
    eventType: AuditEventType;
    actor: Principal | null;
    reason?: string | null;
  },
) {
  await db.insert(actionPlanRevisions).values({
    planId: plan.id,
    version: plan.version,
    eventType: event.eventType,
    actorUserId: event.actor?.id ?? null,
    actorRole: event.actor?.role ?? null,
    reason: event.reason ?? null,
    snapshot: toSnapshot(plan),
    createdAt: new Date(plan.updatedAt),
  });
}

/**
 * Reads back a recorded AI generation: when it happened, the case it was given
 * and the plan the server kept. A plan may only claim AI provenance from a
 * generation the server itself recorded and finished.
 */
async function resolveGeneration(
  db: Database,
  generationId: string | null,
): Promise<{ generatedAt: string; verified: VerifiedGeneration } | null> {
  if (!generationId) {
    return null;
  }

  const [generation] = await db
    .select({
      createdAt: aiGenerations.createdAt,
      status: aiGenerations.status,
      input: aiGenerations.input,
      output: aiGenerations.output,
    })
    .from(aiGenerations)
    .where(eq(aiGenerations.id, generationId));

  if (!generation) {
    throw new ApiError(
      400,
      "unknown_generation",
      "The referenced AI generation does not exist.",
    );
  }

  const output = aiActionPlanSchema.safeParse(generation.output);

  if (generation.status !== "succeeded" || !generation.input || !output.success) {
    throw new ApiError(
      400,
      "unknown_generation",
      "The referenced AI generation did not produce a recorded plan.",
    );
  }

  return {
    generatedAt: generation.createdAt.toISOString(),
    verified: { input: generation.input, output: output.data },
  };
}

/**
 * Locks and returns a plan the actor may access. Out-of-scope plans answer
 * 404, so a department manager cannot probe for other departments' plans.
 */
async function lockPlan(
  db: Database,
  id: string,
  actor: Principal,
): Promise<StoredActionPlan> {
  const [row] = await db
    .select()
    .from(actionPlans)
    .where(eq(actionPlans.id, id))
    .for("update");
  const refs = await loadUserRefs(db);
  const requests = row ? await loadChangeRequests(db, [row.id], refs) : null;
  const plan = row ? rowToPlan(row, refs, requests?.get(row.id) ?? []) : null;

  if (!plan || !canAccessPlan(actor, plan)) {
    throw new ApiError(404, "plan_not_found", "Action plan not found.");
  }

  return plan;
}

/**
 * Writes the plan, bumps its version and records the revision, returning the
 * stored copy. Callers hold the row lock and have already checked the
 * caller's expected version. The version moves by exactly one: the domain
 * relies on that to record which version an approval took effect in.
 */
async function persistPlan(
  db: Database,
  plan: StoredActionPlan,
  event: {
    eventType: AuditEventType;
    actor: Principal;
    reason?: string | null;
  },
): Promise<StoredActionPlan> {
  const next = { ...plan, version: plan.version + 1 };
  const { id, ...values } = planToRow(next);
  void id;
  await db.update(actionPlans).set(values).where(eq(actionPlans.id, plan.id));
  await writeRevision(db, next, event);

  return next;
}

/**
 * Anyone assigned an action must exist and be able to take it. Only
 * assignments that changed are checked, so a later change to a person's role
 * does not block unrelated edits to the plan.
 */
async function assertAssignable(
  db: Database,
  before: StoredActionPlan | null,
  after: StoredActionPlan,
) {
  const previous = new Map(
    (before?.actionPlan?.recommendedOperationalActions ?? []).map((item) => [
      item.id,
      item.assigneeId,
    ]),
  );
  const wanted = new Set<string>();

  for (const item of after.actionPlan?.recommendedOperationalActions ?? []) {
    if (item.assigneeId && previous.get(item.id) !== item.assigneeId) {
      wanted.add(item.assigneeId);
    }
  }

  if (wanted.size === 0) {
    return;
  }

  const rows = await db
    .select()
    .from(users)
    .where(inArray(users.id, [...wanted]));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const department = after.sustainabilityCase.department;

  for (const id of wanted) {
    const user = byId.get(id);
    const eligible =
      user !== undefined &&
      isEligibleAssignee(
        {
          id: user.id,
          role: user.role as Principal["role"],
          department: user.department,
        },
        department,
      );

    if (!eligible) {
      throw new ApiError(
        422,
        "invalid_assignee",
        lifecycleErrorMessages.invalid_assignee,
        { assigneeId: id },
      );
    }
  }
}

/**
 * Rejects an edit made against an out-of-date copy, so two people editing the
 * same plan cannot silently overwrite each other.
 */
function assertFresh(existing: StoredActionPlan, expectedVersion: number) {
  if (existing.version !== expectedVersion) {
    throw new ApiError(
      409,
      "stale_write",
      "This plan was changed by someone else since you opened it. Load the latest version before saving.",
      { currentVersion: existing.version, yourVersion: expectedVersion },
    );
  }
}

/** Checks the permissions an edit needs, based on which fields it changes. */
function authorizeContentChange(
  actor: Principal,
  existing: StoredActionPlan,
  content: PlanContent,
) {
  for (const permission of permissionsForContentChange(
    planToContent(existing),
    content,
  )) {
    requirePermission(actor, permission, existing);
  }
}

/** An audit event for KPI edits, recorded only when they really changed. */
async function recordContentChanges(
  db: Database,
  context: WriteContext,
  before: StoredActionPlan | null,
  after: StoredActionPlan,
) {
  const base = {
    planId: after.id,
    department: after.sustainabilityCase.department,
  };

  const hasKpi = Object.values(after.kpiProgress).some((v) => v.trim());
  // Structural compare: jsonb does not preserve key order, so comparing
  // serialized strings reports phantom changes.
  const kpiChanged = !deepEqual(after.kpiProgress, before?.kpiProgress ?? null);

  if (hasKpi && kpiChanged) {
    await recordAudit(db, context, {
      ...base,
      eventType: "kpi_progress_updated",
    });
  }
}

export async function listPlans(
  db: Database,
  actor: Principal,
): Promise<StoredActionPlan[]> {
  requirePermission(actor, "plan:view");

  const scope =
    actor.role === "department_manager"
      ? eq(actionPlans.department, actor.department ?? "")
      : undefined;
  const rows = await db
    .select()
    .from(actionPlans)
    .where(scope)
    .orderBy(desc(actionPlans.createdAt));
  const refs = await loadUserRefs(db);
  const requests = await loadChangeRequests(
    db,
    rows.map((row) => row.id),
    refs,
  );

  return rows.map((row) => rowToPlan(row, refs, requests.get(row.id) ?? []));
}

export async function getPlan(
  db: Database,
  id: string,
  actor: Principal,
): Promise<StoredActionPlan> {
  requirePermission(actor, "plan:view");

  const [row] = await db
    .select()
    .from(actionPlans)
    .where(eq(actionPlans.id, id));
  const refs = await loadUserRefs(db);
  const requests = row ? await loadChangeRequests(db, [row.id], refs) : null;
  const plan = row ? rowToPlan(row, refs, requests?.get(row.id) ?? []) : null;

  if (!plan || !canAccessPlan(actor, plan)) {
    throw new ApiError(404, "plan_not_found", "Action plan not found.");
  }

  return plan;
}

export async function createPlan(
  db: Database,
  content: PlanContent,
  context: WriteContext,
): Promise<StoredActionPlan> {
  requirePermission(context.actor, "plan:create");

  return db.transaction(async (tx) => {
    const resolved = await resolveGeneration(tx, content.generationId);
    const plan = unwrap(
      createPlanFromContent(content, {
        id: crypto.randomUUID(),
        now: new Date().toISOString(),
        generatedAt: resolved?.generatedAt ?? null,
        generation: resolved?.verified ?? null,
        createdBy: toActorRef(context.actor),
      }),
    );

    await assertAssignable(tx, null, plan);
    await tx.insert(actionPlans).values(planToRow(plan));
    await writeRevision(tx, plan, {
      eventType: "action_plan_created",
      actor: context.actor,
    });
    await recordAudit(tx, context, {
      eventType: "action_plan_created",
      planId: plan.id,
      department: plan.sustainabilityCase.department,
    });
    await recordContentChanges(tx, context, null, plan);

    return plan;
  });
}

export async function updatePlan(
  db: Database,
  id: string,
  content: PlanContent,
  expectedVersion: number,
  context: WriteContext,
): Promise<StoredActionPlan> {
  requirePermission(context.actor, "plan:view");

  return db.transaction(async (tx) => {
    const existing = await lockPlan(tx, id, context.actor);

    assertFresh(existing, expectedVersion);
    authorizeContentChange(context.actor, existing, content);

    // Only a *new* generation needs reading back; an unchanged one is
    // already part of the plan.
    const resolved =
      content.generationId !== existing.generationId
        ? await resolveGeneration(tx, content.generationId)
        : null;
    const plan = unwrap(
      applyContentUpdate(existing, content, {
        now: new Date().toISOString(),
        generatedAt: resolved?.generatedAt ?? null,
        generation: resolved?.verified ?? null,
      }),
    );

    await assertAssignable(tx, existing, plan);

    const saved = {
      ...(await persistPlan(tx, plan, {
        eventType: "action_plan_updated",
        actor: context.actor,
      })),
      changeRequests: existing.changeRequests,
    };
    await recordAudit(tx, context, {
      eventType: "action_plan_updated",
      planId: saved.id,
      department: saved.sustainabilityCase.department,
    });
    await recordContentChanges(tx, context, existing, saved);

    return saved;
  });
}

/**
 * Approve / request changes / complete / reset. Optional pending edits are
 * applied under the same lock rules and committed with the transition.
 */
export async function transitionPlanState(
  db: Database,
  id: string,
  event: LifecycleEvent,
  options: {
    expectedVersion: number;
    content?: PlanContent;
    comment?: string;
    responses?: ChangeResponse[];
  },
  context: WriteContext,
): Promise<StoredActionPlan> {
  requirePermission(context.actor, TRANSITION_PERMISSION[event]);

  return db.transaction(async (tx) => {
    const existing = await lockPlan(tx, id, context.actor);

    requirePermission(context.actor, TRANSITION_PERMISSION[event], existing);
    assertFresh(existing, options.expectedVersion);

    const now = new Date().toISOString();
    let current = existing;

    if (options.content) {
      authorizeContentChange(context.actor, existing, options.content);

      const resolved =
        options.content.generationId !== existing.generationId
          ? await resolveGeneration(tx, options.content.generationId)
          : null;
      current = unwrap(
        applyContentUpdate(existing, options.content, {
          now,
          generatedAt: resolved?.generatedAt ?? null,
          generation: resolved?.verified ?? null,
        }),
      );
    }

    // Resubmitting must answer every open request, once each.
    const open = existing.changeRequests.filter(
      (request) => request.status === "open",
    );
    const responses = options.responses ?? [];

    if (event === "resubmit") {
      const answered = new Set(responses.map((item) => item.requestId));
      const covers =
        answered.size === responses.length &&
        open.length > 0 &&
        open.every((request) => answered.has(request.id)) &&
        responses.every((item) => open.some((r) => r.id === item.requestId));

      if (open.length > 0 && !covers) {
        throw new ApiError(
          422,
          "responses_incomplete",
          lifecycleErrorMessages.responses_incomplete,
          { openRequestIds: open.map((request) => request.id) },
        );
      }
    }

    const plan = unwrap(
      transitionPlan(current, event, now, {
        actor: toActorRef(context.actor),
        comment: options.comment,
      }),
    );

    await assertAssignable(tx, existing, plan);

    const reason =
      event === "request_changes" || event === "acknowledge_drift"
        ? (options.comment ?? null)
        : event === "resubmit"
          ? `Responded to ${responses.length} change request${responses.length === 1 ? "" : "s"}`
          : null;
    const stored = await persistPlan(tx, plan, {
      eventType: TRANSITION_AUDIT_EVENT[event],
      actor: context.actor,
      reason,
    });

    if (event === "request_changes" && options.comment) {
      await tx.insert(changeRequests).values({
        planId: stored.id,
        comment: options.comment.trim(),
        requestedBy: context.actor.id,
        requestedAt: new Date(now),
      });
    }

    if (event === "resubmit") {
      for (const item of responses) {
        await tx
          .update(changeRequests)
          .set({
            status: "addressed",
            response: item.response.trim(),
            respondedBy: context.actor.id,
            respondedAt: new Date(now),
          })
          .where(
            and(
              eq(changeRequests.id, item.requestId),
              eq(changeRequests.planId, stored.id),
              eq(changeRequests.status, "open"),
            ),
          );
      }
    }

    await recordAudit(tx, context, {
      eventType: TRANSITION_AUDIT_EVENT[event],
      planId: stored.id,
      department: stored.sustainabilityCase.department,
      metadata: options.comment ? { comment: options.comment } : undefined,
    });
    await recordContentChanges(tx, context, existing, stored);

    const refs = await loadUserRefs(tx);
    const requests = await loadChangeRequests(tx, [stored.id], refs);

    return { ...stored, changeRequests: requests.get(stored.id) ?? [] };
  });
}

export async function deletePlan(
  db: Database,
  id: string,
  context: WriteContext,
): Promise<void> {
  requirePermission(context.actor, "plan:delete");

  await db.transaction(async (tx) => {
    const existing = await lockPlan(tx, id, context.actor);

    await tx.delete(actionPlans).where(eq(actionPlans.id, id));
    await recordAudit(tx, context, {
      eventType: "action_plan_deleted",
      planId: id,
      department: existing.sustainabilityCase.department,
    });
  });
}

/** Inserts demo plans that are not already present; returns how many. */
export async function seedDemoPlans(
  db: Database,
  demoPlans: StoredActionPlan[],
  context: WriteContext,
): Promise<number> {
  requirePermission(context.actor, "plan:create");

  return db.transaction(async (tx) => {
    if (demoPlans.length === 0) {
      return 0;
    }

    const inserted = await tx
      .insert(actionPlans)
      .values(demoPlans.map(planToRow))
      .onConflictDoNothing()
      .returning({ id: actionPlans.id });
    const insertedIds = new Set(inserted.map((row) => row.id));

    // Every plan starts with a first revision, like one created by hand.
    for (const plan of demoPlans) {
      if (insertedIds.has(plan.id)) {
        await writeRevision(tx, plan, {
          eventType: "action_plan_created",
          actor: null,
          reason: "Fictional demo case.",
        });
      }
    }

    if (inserted.length > 0) {
      await recordAudit(tx, context, {
        eventType: "demo_cases_loaded",
        planId: null,
        department: null,
        metadata: { count: inserted.length },
      });
    }

    return inserted.length;
  });
}

/** Appends an implementation note. Notes are never edited or removed. */
export async function addNote(
  db: Database,
  planId: string,
  body: string,
  context: WriteContext,
): Promise<PlanNote> {
  requirePermission(context.actor, "plan:notes");

  return db.transaction(async (tx) => {
    // Same scope rules as reading the plan: out-of-scope plans are a 404.
    const plan = await lockPlan(tx, planId, context.actor);

    requirePermission(context.actor, "plan:notes", plan);

    const [row] = await tx
      .insert(planNotes)
      .values({
        planId,
        body: body.trim(),
        authorUserId: context.actor.id,
        authorRole: context.actor.role,
      })
      .returning();

    await recordAudit(tx, context, {
      eventType: "note_added",
      planId,
      department: plan.sustainabilityCase.department,
    });

    return {
      id: row.id,
      body: row.body,
      author: {
        id: context.actor.id,
        name: context.actor.name,
        role: context.actor.role,
      },
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/** A plan's notes, oldest first. */
export async function listNotes(
  db: Database,
  planId: string,
  actor: Principal,
): Promise<PlanNote[]> {
  await getPlan(db, planId, actor);

  const rows = await db
    .select()
    .from(planNotes)
    .where(eq(planNotes.planId, planId))
    .orderBy(asc(planNotes.createdAt), asc(planNotes.id));
  const refs = await loadUserRefs(db);

  return rows.map((row) => {
    const author = row.authorUserId ? refs.get(row.authorUserId) : undefined;

    return {
      id: row.id,
      body: row.body,
      author: author
        ? {
            id: author.id,
            name: author.name,
            role: row.authorRole ?? author.role,
          }
        : null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

function revisionActor(
  row: { actorUserId: string | null; actorRole: string | null },
  refs: UserRefs,
) {
  const actor = row.actorUserId ? refs.get(row.actorUserId) : undefined;

  return actor
    ? { id: actor.id, name: actor.name, role: row.actorRole ?? actor.role }
    : null;
}

/** The versions a plan has had, oldest first, without their content. */
export async function listRevisions(
  db: Database,
  planId: string,
  actor: Principal,
): Promise<PlanRevisionSummary[]> {
  await getPlan(db, planId, actor);

  const rows = await db
    .select()
    .from(actionPlanRevisions)
    .where(eq(actionPlanRevisions.planId, planId))
    .orderBy(asc(actionPlanRevisions.version));
  const refs = await loadUserRefs(db);

  return rows.map((row) => ({
    version: row.version,
    eventType: row.eventType,
    actor: revisionActor(row, refs),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** One version of a plan, with its content. */
export async function getRevision(
  db: Database,
  planId: string,
  version: number,
  actor: Principal,
): Promise<PlanRevision> {
  await getPlan(db, planId, actor);

  const [row] = await db
    .select()
    .from(actionPlanRevisions)
    .where(
      and(
        eq(actionPlanRevisions.planId, planId),
        eq(actionPlanRevisions.version, version),
      ),
    );

  if (!row) {
    throw new ApiError(404, "revision_not_found", "Revision not found.");
  }

  const refs = await loadUserRefs(db);

  return {
    version: row.version,
    eventType: row.eventType,
    actor: revisionActor(row, refs),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    snapshot: row.snapshot,
  };
}

export type GenerationDiagnostics = {
  generation: {
    id: string;
    model: string;
    promptVersion: string;
    createdAt: string;
    policyClaims: number;
    policyClaimsVerified: number;
  };
  diagnostics: RetrievalDiagnostics;
};

/**
 * What retrieval considered when this plan was generated, and why each
 * section was or was not given to the model. For managers and reviewers: it
 * names documents of every department.
 */
export async function getGenerationDiagnostics(
  db: Database,
  planId: string,
  actor: Principal,
): Promise<GenerationDiagnostics> {
  requirePermission(actor, "audit:view");

  const plan = await getPlan(db, planId, actor);

  if (!plan.generationId) {
    throw new ApiError(
      404,
      "no_diagnostics",
      "This plan was not generated by the AI, so there is no retrieval record.",
    );
  }

  const [row] = await db
    .select()
    .from(aiGenerations)
    .where(eq(aiGenerations.id, plan.generationId));

  if (!row?.diagnostics) {
    throw new ApiError(
      404,
      "no_diagnostics",
      "Retrieval was not recorded for this generation.",
    );
  }

  return {
    generation: {
      id: row.id,
      model: row.model,
      promptVersion: row.promptVersion,
      createdAt: row.createdAt.toISOString(),
      policyClaims: row.policyClaims,
      policyClaimsVerified: row.policyClaimsVerified,
    },
    diagnostics: row.diagnostics,
  };
}

async function readEvents(
  db: Database,
  where: ReturnType<typeof eq> | undefined,
  order: "asc" | "desc",
  limit: number,
): Promise<AuditEvent[]> {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(
      order === "asc"
        ? asc(auditEvents.createdAt)
        : desc(auditEvents.createdAt),
      sql`${auditEvents.id}`,
    )
    .limit(limit);
  const refs = await loadUserRefs(db);

  return rows.map((row) => {
    const actor = row.actorUserId ? refs.get(row.actorUserId) : undefined;
    const comment = row.metadata?.comment;

    return {
      id: row.id,
      eventType: row.eventType as AuditEventType,
      planId: row.planId,
      department: row.department,
      actor: actor
        ? { id: actor.id, name: actor.name, role: row.actorRole ?? actor.role }
        : null,
      comment: typeof comment === "string" ? comment : null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/** Organisation-wide recent events (managers and reviewers only). */
export async function listAuditEvents(
  db: Database,
  actor: Principal,
  limit = 500,
): Promise<AuditEvent[]> {
  requirePermission(actor, "audit:view");

  return readEvents(db, undefined, "desc", limit);
}

/** The history of one plan, oldest first. */
export async function getPlanHistory(
  db: Database,
  planId: string,
  actor: Principal,
): Promise<AuditEvent[]> {
  // Reuses the plan lookup so scope rules (and 404s) are identical.
  await getPlan(db, planId, actor);

  return readEvents(db, and(eq(auditEvents.planId, planId)), "asc", 200);
}

/**
 * Returns the demo to a known state: removes every plan and its history, then
 * restores the fictional demo plans. Generation records are kept because they
 * back the rate limits. Used by the nightly job and the manager's reset.
 */
export async function replaceDemoPlans(
  db: Database,
  demoPlans: StoredActionPlan[],
  {
    requestId,
    actorUserId,
    trigger,
  }: {
    requestId: string | null;
    actorUserId: string | null;
    trigger: "manual" | "scheduled";
  },
): Promise<{ removed: number; restored: number }> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(actionPlans)
      .returning({ id: actionPlans.id });

    await tx.delete(auditEvents);

    if (demoPlans.length > 0) {
      await tx.insert(actionPlans).values(demoPlans.map(planToRow));

      for (const plan of demoPlans) {
        await writeRevision(tx, plan, {
          eventType: "action_plan_created",
          actor: null,
          reason: "Fictional demo case.",
        });
      }
    }

    await tx.insert(auditEvents).values({
      eventType: "demo_reset",
      planId: null,
      department: null,
      actorUserId,
      actorRole: null,
      requestId,
      metadata: {
        trigger,
        removed: removed.length,
        restored: demoPlans.length,
      },
    });

    return { removed: removed.length, restored: demoPlans.length };
  });
}

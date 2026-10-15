import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  ActorRef,
  AuditEvent,
  AuditEventType,
  Priority,
  StoredActionPlan,
} from "@/lib/types";
import type { PlanContent } from "@/lib/schemas/action-plan";
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

const { actionPlans, aiGenerations, auditEvents, users } = schema;

export type WriteContext = {
  requestId: string | null;
  actor: Principal;
};

const LIFECYCLE_STATUS: Record<LifecycleError, number> = {
  case_incomplete: 422,
  not_generated: 422,
  comment_required: 422,
  not_ready: 409,
  already_approved: 409,
  not_approved: 409,
  already_completed: 409,
  plan_locked: 409,
  self_approval_forbidden: 403,
};

const TRANSITION_AUDIT_EVENT: Record<LifecycleEvent, AuditEventType> = {
  approve: "action_plan_approved",
  request_changes: "changes_requested",
  complete: "action_plan_completed",
  reset_approval: "approval_reset",
};

const TRANSITION_PERMISSION: Record<LifecycleEvent, Permission> = {
  approve: "plan:approve",
  request_changes: "plan:request_changes",
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

function rowToPlan(row: ActionPlanRow, refs: UserRefs): StoredActionPlan {
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
    actionNotes: row.actionNotes,
    owner: row.owner,
    priority: row.priority as Priority,
    targetDate: row.targetDate ?? "",
    nextReviewDate: row.nextReviewDate ?? "",
    readinessChecklist: row.readinessChecklist,
    kpiProgress: row.kpiProgress,
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
    actionNotes: plan.actionNotes,
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

/** Resolves when a referenced AI generation happened, or fails if unknown. */
async function resolveGeneration(db: Database, generationId: string | null) {
  if (!generationId) {
    return null;
  }

  const [generation] = await db
    .select({ createdAt: aiGenerations.createdAt })
    .from(aiGenerations)
    .where(eq(aiGenerations.id, generationId));

  if (!generation) {
    throw new ApiError(
      400,
      "unknown_generation",
      "The referenced AI generation does not exist.",
    );
  }

  return generation.createdAt.toISOString();
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
  const plan = row ? rowToPlan(row, await loadUserRefs(db)) : null;

  if (!plan || !canAccessPlan(actor, plan)) {
    throw new ApiError(404, "plan_not_found", "Action plan not found.");
  }

  return plan;
}

async function persistPlan(db: Database, plan: StoredActionPlan) {
  const { id, ...values } = planToRow(plan);
  void id;
  await db.update(actionPlans).set(values).where(eq(actionPlans.id, plan.id));
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

/** Audit events for note and KPI edits, recorded only when they really changed. */
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

  if (
    after.actionNotes.trim() &&
    after.actionNotes !== (before?.actionNotes ?? "")
  ) {
    await recordAudit(db, context, { ...base, eventType: "action_notes_updated" });
  }

  const hasKpi = Object.values(after.kpiProgress).some((v) => v.trim());
  // Structural compare: jsonb does not preserve key order, so comparing
  // serialized strings reports phantom changes.
  const kpiChanged = !deepEqual(after.kpiProgress, before?.kpiProgress ?? null);

  if (hasKpi && kpiChanged) {
    await recordAudit(db, context, { ...base, eventType: "kpi_progress_updated" });
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

  return rows.map((row) => rowToPlan(row, refs));
}

export async function getPlan(
  db: Database,
  id: string,
  actor: Principal,
): Promise<StoredActionPlan> {
  requirePermission(actor, "plan:view");

  const [row] = await db.select().from(actionPlans).where(eq(actionPlans.id, id));
  const plan = row ? rowToPlan(row, await loadUserRefs(db)) : null;

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
    const generatedAt = await resolveGeneration(tx, content.generationId);
    const plan = unwrap(
      createPlanFromContent(content, {
        id: crypto.randomUUID(),
        now: new Date().toISOString(),
        generatedAt,
        createdBy: toActorRef(context.actor),
      }),
    );

    await tx.insert(actionPlans).values(planToRow(plan));
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
  context: WriteContext,
): Promise<StoredActionPlan> {
  requirePermission(context.actor, "plan:view");

  return db.transaction(async (tx) => {
    const existing = await lockPlan(tx, id, context.actor);

    authorizeContentChange(context.actor, existing, content);

    const generatedAt = await resolveGeneration(tx, content.generationId);
    const plan = unwrap(
      applyContentUpdate(existing, content, {
        now: new Date().toISOString(),
        generatedAt,
      }),
    );

    await persistPlan(tx, plan);
    await recordAudit(tx, context, {
      eventType: "action_plan_updated",
      planId: plan.id,
      department: plan.sustainabilityCase.department,
    });
    await recordContentChanges(tx, context, existing, plan);

    return plan;
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
  options: { content?: PlanContent; comment?: string },
  context: WriteContext,
): Promise<StoredActionPlan> {
  requirePermission(context.actor, TRANSITION_PERMISSION[event]);

  return db.transaction(async (tx) => {
    const existing = await lockPlan(tx, id, context.actor);

    requirePermission(context.actor, TRANSITION_PERMISSION[event], existing);

    const now = new Date().toISOString();
    let current = existing;

    if (options.content) {
      authorizeContentChange(context.actor, existing, options.content);

      const generatedAt = await resolveGeneration(
        tx,
        options.content.generationId,
      );
      current = unwrap(
        applyContentUpdate(existing, options.content, { now, generatedAt }),
      );
    }

    const plan = unwrap(
      transitionPlan(current, event, now, {
        actor: toActorRef(context.actor),
        comment: options.comment,
      }),
    );

    await persistPlan(tx, plan);
    await recordAudit(tx, context, {
      eventType: TRANSITION_AUDIT_EVENT[event],
      planId: plan.id,
      department: plan.sustainabilityCase.department,
      metadata: options.comment ? { comment: options.comment } : undefined,
    });
    await recordContentChanges(tx, context, existing, plan);

    return plan;
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
      order === "asc" ? asc(auditEvents.createdAt) : desc(auditEvents.createdAt),
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

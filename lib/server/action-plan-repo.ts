import { desc, eq, sql } from "drizzle-orm";
import type {
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
  transitionPlan,
  type LifecycleError,
  type LifecycleEvent,
  type LifecycleResult,
} from "@/features/action-plans/domain/lifecycle";
import { ApiError } from "./api";
import { schema, type Database } from "./db";
import type { ActionPlanRow } from "./db/schema";

const { actionPlans, aiGenerations, auditEvents } = schema;

export type WriteContext = { requestId: string | null };

const LIFECYCLE_STATUS: Record<LifecycleError, number> = {
  case_incomplete: 422,
  not_generated: 422,
  not_ready: 409,
  already_approved: 409,
  not_approved: 409,
  already_completed: 409,
  plan_locked: 409,
};

const TRANSITION_AUDIT_EVENT: Record<LifecycleEvent, AuditEventType> = {
  approve: "action_plan_approved",
  complete: "action_plan_completed",
  reset_approval: "approval_reset",
};

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

function rowToPlan(row: ActionPlanRow): StoredActionPlan {
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
    createdAt: new Date(plan.createdAt),
    updatedAt: new Date(plan.updatedAt),
  };
}

async function recordAudit(
  db: Database,
  event: {
    eventType: AuditEventType;
    planId: string | null;
    department: string | null;
    requestId: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(auditEvents).values({
    eventType: event.eventType,
    planId: event.planId,
    department: event.department,
    requestId: event.requestId,
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

async function lockPlan(db: Database, id: string): Promise<StoredActionPlan> {
  const [row] = await db
    .select()
    .from(actionPlans)
    .where(eq(actionPlans.id, id))
    .for("update");

  if (!row) {
    throw new ApiError(404, "plan_not_found", "Action plan not found.");
  }

  return rowToPlan(row);
}

async function persistPlan(db: Database, plan: StoredActionPlan) {
  const { id, ...values } = planToRow(plan);
  void id;
  await db.update(actionPlans).set(values).where(eq(actionPlans.id, plan.id));
}

/** Audit events for note and KPI edits, recorded only when they really changed. */
async function recordContentChanges(
  db: Database,
  before: StoredActionPlan | null,
  after: StoredActionPlan,
  context: WriteContext,
) {
  const base = {
    planId: after.id,
    department: after.sustainabilityCase.department,
    requestId: context.requestId,
  };

  if (
    after.actionNotes.trim() &&
    after.actionNotes !== (before?.actionNotes ?? "")
  ) {
    await recordAudit(db, { ...base, eventType: "action_notes_updated" });
  }

  const hasKpi = Object.values(after.kpiProgress).some((v) => v.trim());
  const kpiChanged =
    JSON.stringify(after.kpiProgress) !==
    JSON.stringify(before?.kpiProgress ?? null);

  if (hasKpi && kpiChanged) {
    await recordAudit(db, { ...base, eventType: "kpi_progress_updated" });
  }
}

export async function listPlans(db: Database): Promise<StoredActionPlan[]> {
  const rows = await db
    .select()
    .from(actionPlans)
    .orderBy(desc(actionPlans.createdAt));

  return rows.map(rowToPlan);
}

export async function getPlan(
  db: Database,
  id: string,
): Promise<StoredActionPlan> {
  const [row] = await db.select().from(actionPlans).where(eq(actionPlans.id, id));

  if (!row) {
    throw new ApiError(404, "plan_not_found", "Action plan not found.");
  }

  return rowToPlan(row);
}

export async function createPlan(
  db: Database,
  content: PlanContent,
  context: WriteContext,
): Promise<StoredActionPlan> {
  return db.transaction(async (tx) => {
    const generatedAt = await resolveGeneration(tx, content.generationId);
    const plan = unwrap(
      createPlanFromContent(content, {
        id: crypto.randomUUID(),
        now: new Date().toISOString(),
        generatedAt,
      }),
    );

    await tx.insert(actionPlans).values(planToRow(plan));
    await recordAudit(tx, {
      eventType: "action_plan_created",
      planId: plan.id,
      department: plan.sustainabilityCase.department,
      requestId: context.requestId,
    });
    await recordContentChanges(tx, null, plan, context);

    return plan;
  });
}

export async function updatePlan(
  db: Database,
  id: string,
  content: PlanContent,
  context: WriteContext,
): Promise<StoredActionPlan> {
  return db.transaction(async (tx) => {
    const existing = await lockPlan(tx, id);
    const generatedAt = await resolveGeneration(tx, content.generationId);
    const plan = unwrap(
      applyContentUpdate(existing, content, {
        now: new Date().toISOString(),
        generatedAt,
      }),
    );

    await persistPlan(tx, plan);
    await recordAudit(tx, {
      eventType: "action_plan_updated",
      planId: plan.id,
      department: plan.sustainabilityCase.department,
      requestId: context.requestId,
    });
    await recordContentChanges(tx, existing, plan, context);

    return plan;
  });
}

/**
 * Approve / complete / reset. Optional pending edits are applied under the
 * same lock rules and committed together with the transition.
 */
export async function transitionPlanState(
  db: Database,
  id: string,
  event: LifecycleEvent,
  content: PlanContent | undefined,
  context: WriteContext,
): Promise<StoredActionPlan> {
  return db.transaction(async (tx) => {
    const existing = await lockPlan(tx, id);
    const now = new Date().toISOString();
    let current = existing;

    if (content) {
      const generatedAt = await resolveGeneration(tx, content.generationId);
      current = unwrap(
        applyContentUpdate(existing, content, { now, generatedAt }),
      );
    }

    const plan = unwrap(transitionPlan(current, event, now));

    await persistPlan(tx, plan);
    await recordAudit(tx, {
      eventType: TRANSITION_AUDIT_EVENT[event],
      planId: plan.id,
      department: plan.sustainabilityCase.department,
      requestId: context.requestId,
    });
    await recordContentChanges(tx, existing, plan, context);

    return plan;
  });
}

export async function deletePlan(
  db: Database,
  id: string,
  context: WriteContext,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await lockPlan(tx, id);

    await tx.delete(actionPlans).where(eq(actionPlans.id, id));
    await recordAudit(tx, {
      eventType: "action_plan_deleted",
      planId: id,
      department: existing.sustainabilityCase.department,
      requestId: context.requestId,
    });
  });
}

/** Inserts demo plans that are not already present; returns how many. */
export async function seedDemoPlans(
  db: Database,
  demoPlans: StoredActionPlan[],
  context: WriteContext,
): Promise<number> {
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
      await recordAudit(tx, {
        eventType: "demo_cases_loaded",
        planId: null,
        department: null,
        requestId: context.requestId,
        metadata: { count: inserted.length },
      });
    }

    return inserted.length;
  });
}

export async function listAuditEvents(
  db: Database,
  limit = 500,
): Promise<AuditEvent[]> {
  const rows = await db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt), sql`${auditEvents.id}`)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType as AuditEventType,
    planId: row.planId,
    department: row.department,
    createdAt: row.createdAt.toISOString(),
  }));
}

import type {
  GovernanceReview,
  PlanContent,
  ReadinessChecklist,
  StoredActionPlan,
} from "@/lib/types";
import type { EditorDraft } from "../types";
import { deepEqual } from "./deep-equal";
import { getPlanTitle, getReviewerStatus, hasCompleteCase } from "./plan-utils";

/**
 * Pure lifecycle rules for an action plan.
 *
 * The same rules run in the browser (to give fast feedback) and on the server
 * (which is the authority). Every function returns a complete next plan or an
 * error; nothing here touches React, the network or the database.
 */

export type LifecycleEvent = "approve" | "complete" | "reset_approval";

export type LifecycleError =
  | "case_incomplete"
  | "not_generated"
  | "not_ready"
  | "already_approved"
  | "not_approved"
  | "already_completed"
  | "plan_locked";

export type LifecycleResult =
  | { ok: true; plan: StoredActionPlan }
  | { ok: false; error: LifecycleError };

export const lifecycleErrorMessages: Record<LifecycleError, string> = {
  case_incomplete:
    "Please complete all required fields before saving an action plan.",
  not_generated: "Generate an action plan before saving or approving.",
  not_ready:
    "Complete the readiness checklist and accountability fields before approval.",
  already_approved: "This action plan is already approved.",
  not_approved: "Only an approved action plan can be completed or reset.",
  already_completed: "Completed action plans cannot be changed.",
  plan_locked:
    "This action plan is approved and locked. Reset approval before changing it.",
};

function isReadinessChecklistComplete(readinessChecklist: ReadinessChecklist) {
  return Object.values(readinessChecklist).every(Boolean);
}

export function isReadyForApproval(
  plan: Pick<
    StoredActionPlan,
    "owner" | "targetDate" | "nextReviewDate" | "readinessChecklist"
  >,
) {
  return (
    plan.owner.trim().length > 0 &&
    plan.targetDate.trim().length > 0 &&
    plan.nextReviewDate.trim().length > 0 &&
    isReadinessChecklistComplete(plan.readinessChecklist)
  );
}

export function buildGovernanceReview({
  approved,
  completed,
  generatedAt,
}: {
  approved: boolean;
  completed: boolean;
  generatedAt: string;
}): GovernanceReview {
  return {
    humanReviewRequired: true,
    containsGuestPersonalData: false,
    approvedOperationalUse: approved,
    reviewerStatus: getReviewerStatus(approved, completed),
    auditTimestamp: generatedAt,
  };
}

export function planToDraft(plan: StoredActionPlan): EditorDraft {
  return {
    id: plan.id,
    sustainabilityCase: plan.sustainabilityCase,
    actionPlan: plan.actionPlan,
    generationId: plan.generationId,
    governanceReview: plan.governanceReview,
    actionNotes: plan.actionNotes,
    owner: plan.owner,
    priority: plan.priority,
    targetDate: plan.targetDate,
    nextReviewDate: plan.nextReviewDate,
    readinessChecklist: plan.readinessChecklist,
    kpiProgress: plan.kpiProgress,
    approved: plan.approved,
    completed: plan.completed,
    createdAt: plan.createdAt,
  };
}

/** The part of a draft a client is allowed to send to the server. */
export function draftToContent(draft: EditorDraft): PlanContent {
  return {
    sustainabilityCase: draft.sustainabilityCase,
    actionPlan: draft.actionPlan,
    generationId: draft.generationId,
    owner: draft.owner,
    priority: draft.priority,
    targetDate: draft.targetDate,
    nextReviewDate: draft.nextReviewDate,
    readinessChecklist: draft.readinessChecklist,
    kpiProgress: draft.kpiProgress,
    actionNotes: draft.actionNotes,
  };
}

/** Client-side pre-check so users get immediate, specific feedback. */
export function checkDraftSavable(draft: EditorDraft): LifecycleError | null {
  if (!hasCompleteCase(draft.sustainabilityCase)) {
    return "case_incomplete";
  }

  return draft.actionPlan ? null : "not_generated";
}

/** Builds a brand-new, unapproved plan from validated content. */
export function createPlanFromContent(
  content: PlanContent,
  {
    id,
    now,
    generatedAt,
  }: { id: string; now: string; generatedAt: string | null },
): LifecycleResult {
  if (!content.actionPlan) {
    return { ok: false, error: "not_generated" };
  }

  return {
    ok: true,
    plan: {
      id,
      title: getPlanTitle(content.sustainabilityCase),
      ...content,
      actionPlan: content.actionPlan,
      governanceReview: buildGovernanceReview({
        approved: false,
        completed: false,
        generatedAt: generatedAt ?? now,
      }),
      approved: false,
      completed: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

const FIELDS_LOCKED_AFTER_APPROVAL = [
  "sustainabilityCase",
  "actionPlan",
  "generationId",
  "owner",
  "priority",
  "targetDate",
  "nextReviewDate",
  "readinessChecklist",
] as const satisfies readonly (keyof PlanContent)[];

/**
 * Applies edited content to an existing plan, enforcing the lock rules:
 * - draft / pending approval: everything is editable
 * - approved: only implementation notes and KPI progress
 * - completed: only implementation notes
 */
export function applyContentUpdate(
  existing: StoredActionPlan,
  content: PlanContent,
  {
    now,
    generatedAt,
  }: { now: string; generatedAt: string | null },
): LifecycleResult {
  if (!content.actionPlan) {
    return { ok: false, error: "not_generated" };
  }

  const existingContent = planToContent(existing);

  if (existing.approved || existing.completed) {
    const lockedFieldChanged = FIELDS_LOCKED_AFTER_APPROVAL.some(
      (field) => !deepEqual(existingContent[field], content[field]),
    );
    const kpiChanged = !deepEqual(existing.kpiProgress, content.kpiProgress);

    if (lockedFieldChanged || (existing.completed && kpiChanged)) {
      return { ok: false, error: "plan_locked" };
    }
  }

  const generationChanged = existing.generationId !== content.generationId;

  return {
    ok: true,
    plan: {
      ...existing,
      title: getPlanTitle(content.sustainabilityCase),
      ...content,
      actionPlan: content.actionPlan,
      governanceReview: generationChanged
        ? buildGovernanceReview({
            approved: existing.approved,
            completed: existing.completed,
            generatedAt: generatedAt ?? now,
          })
        : existing.governanceReview,
      updatedAt: now,
    },
  };
}

export function planToContent(plan: StoredActionPlan): PlanContent {
  return {
    sustainabilityCase: plan.sustainabilityCase,
    actionPlan: plan.actionPlan,
    generationId: plan.generationId,
    owner: plan.owner,
    priority: plan.priority,
    targetDate: plan.targetDate,
    nextReviewDate: plan.nextReviewDate,
    readinessChecklist: plan.readinessChecklist,
    kpiProgress: plan.kpiProgress,
    actionNotes: plan.actionNotes,
  };
}

/** Applies a lifecycle event to a plan, or explains why it is not allowed. */
export function transitionPlan(
  plan: StoredActionPlan,
  event: LifecycleEvent,
  now: string,
): LifecycleResult {
  switch (event) {
    case "approve": {
      if (!plan.actionPlan) {
        return { ok: false, error: "not_generated" };
      }

      if (plan.completed) {
        return { ok: false, error: "already_completed" };
      }

      if (plan.approved) {
        return { ok: false, error: "already_approved" };
      }

      if (!isReadyForApproval(plan)) {
        return { ok: false, error: "not_ready" };
      }

      return { ok: true, plan: withApproval(plan, true, false, now) };
    }

    case "complete": {
      if (plan.completed) {
        return { ok: false, error: "already_completed" };
      }

      if (!plan.approved) {
        return { ok: false, error: "not_approved" };
      }

      return { ok: true, plan: withApproval(plan, true, true, now) };
    }

    case "reset_approval": {
      if (plan.completed) {
        return { ok: false, error: "already_completed" };
      }

      if (!plan.approved) {
        return { ok: false, error: "not_approved" };
      }

      return { ok: true, plan: withApproval(plan, false, false, now) };
    }
  }
}

function withApproval(
  plan: StoredActionPlan,
  approved: boolean,
  completed: boolean,
  now: string,
): StoredActionPlan {
  return {
    ...plan,
    approved,
    completed,
    updatedAt: now,
    governanceReview: {
      ...plan.governanceReview,
      approvedOperationalUse: approved,
      reviewerStatus: getReviewerStatus(approved, completed),
    },
  };
}

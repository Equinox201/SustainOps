import type {
  ReadinessChecklist,
  StoredActionPlan,
} from "@/lib/types";
import type { EditorDraft } from "../types";
import {
  createId,
  getPlanTitle,
  getReviewerStatus,
  hasCompleteCase,
  trimCase,
} from "./plan-utils";

/**
 * Pure lifecycle rules for an action plan.
 *
 * Every state change (save, approve, complete, reset approval) goes through
 * this module so the rules live in one place and return a complete next plan.
 * Callers persist that plan in a single write instead of patching UI state.
 */

export type LifecycleEvent = "approve" | "complete" | "reset_approval";

export type LifecycleError =
  | "case_incomplete"
  | "not_generated"
  | "not_ready"
  | "already_approved"
  | "not_approved"
  | "already_completed";

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

export function planToDraft(plan: StoredActionPlan): EditorDraft {
  return {
    id: plan.id,
    sustainabilityCase: plan.sustainabilityCase,
    actionPlan: plan.actionPlan,
    governanceReview: plan.governanceReview,
    actionNotes: plan.actionNotes ?? "",
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

/** Turns the editor draft into a storable plan (create or update). */
export function draftToPlan(draft: EditorDraft, now: string): LifecycleResult {
  if (!hasCompleteCase(draft.sustainabilityCase)) {
    return { ok: false, error: "case_incomplete" };
  }

  if (!draft.actionPlan) {
    return { ok: false, error: "not_generated" };
  }

  const sustainabilityCase = trimCase(draft.sustainabilityCase);

  return {
    ok: true,
    plan: {
      id: draft.id ?? createId(),
      title: getPlanTitle(sustainabilityCase),
      sustainabilityCase,
      actionPlan: draft.actionPlan,
      governanceReview: {
        ...draft.governanceReview,
        reviewerStatus: getReviewerStatus(draft.approved, draft.completed),
        approvedOperationalUse: draft.approved,
      },
      actionNotes: draft.actionNotes,
      owner: draft.owner.trim(),
      priority: draft.priority,
      targetDate: draft.targetDate,
      nextReviewDate: draft.nextReviewDate,
      readinessChecklist: draft.readinessChecklist,
      kpiProgress: draft.kpiProgress,
      approved: draft.approved,
      completed: draft.completed,
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
    },
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

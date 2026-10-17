import type {
  AIActionPlan,
  ActorRef,
  GovernanceReview,
  PlanContent,
  ReadinessChecklist,
  StoredActionPlan,
  SustainabilityCaseInput,
} from "@/lib/types";
import type { EditorDraft } from "../types";
import { deepEqual } from "./deep-equal";
import {
  asHumanAuthored,
  coreActionView,
  generatedText,
  getCaseDrift,
  normalizeActions,
  trackingView,
  type ActionItemError,
} from "./action-items";
import { getPlanTitle, getReviewerStatus, hasCompleteCase } from "./plan-utils";

/**
 * Pure lifecycle rules for an action plan.
 *
 * The same rules run in the browser (to give fast feedback) and on the server
 * (which is the authority). Every function returns a complete next plan or an
 * error; nothing here touches React, the network or the database.
 */

export type LifecycleEvent =
  | "approve"
  | "request_changes"
  | "resubmit"
  | "acknowledge_drift"
  | "complete"
  | "reset_approval";

export type LifecycleError =
  | "case_incomplete"
  | "not_generated"
  | "not_ready"
  | "already_approved"
  | "not_approved"
  | "already_completed"
  | "plan_locked"
  | "comment_required"
  | "changes_pending"
  | "no_open_request"
  | "responses_incomplete"
  | "invalid_assignee"
  | "needs_reassessment"
  | "no_drift"
  | "plan_differs_from_generation"
  | "generated_text_locked"
  | "generation_required"
  | "self_approval_forbidden"
  | ActionItemError;

export type LifecycleResult =
  { ok: true; plan: StoredActionPlan } | { ok: false; error: LifecycleError };

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
  comment_required: "Add a comment explaining what needs to change.",
  self_approval_forbidden:
    "You cannot approve a plan you created. Another reviewer must approve it.",
  changes_pending:
    "The reviewer asked for changes. Respond to each request and resubmit before this plan can be approved.",
  no_open_request: "There are no open change requests to resubmit.",
  responses_incomplete:
    "Respond to every open change request before resubmitting.",
  invalid_assignee:
    "An action is assigned to someone who cannot take it. Pick a person from this plan's department.",
  needs_reassessment:
    "The case was edited after this plan was generated. Regenerate the plan, or acknowledge that it still applies, before approval.",
  no_drift: "The case has not changed since this plan was generated.",
  plan_differs_from_generation:
    "The plan does not match what the AI generated. Save the plan as it was generated, then edit its actions.",
  generated_text_locked:
    "The AI-generated text cannot be edited. Edit the actions, or regenerate the plan.",
  generation_required:
    "A plan that came from the AI cannot be detached from its generation.",
  invalid_actions: "Each action must have its own id.",
  blank_action:
    "Every action needs some text. Fill in or remove the empty one.",
  blocked_reason_required: "Say what is blocking an action marked Blocked.",
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
  changesRequested = false,
  generatedAt,
}: {
  approved: boolean;
  completed: boolean;
  changesRequested?: boolean;
  generatedAt: string;
}): GovernanceReview {
  return {
    humanReviewRequired: true,
    containsGuestPersonalData: false,
    approvedOperationalUse: approved,
    reviewerStatus: getReviewerStatus(approved, completed, changesRequested),
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
    owner: plan.owner,
    priority: plan.priority,
    targetDate: plan.targetDate,
    nextReviewDate: plan.nextReviewDate,
    readinessChecklist: plan.readinessChecklist,
    kpiProgress: plan.kpiProgress,
    version: plan.version,
    approvedVersion: plan.approvedVersion,
    originalAiOutput: plan.originalAiOutput,
    generatedCase: plan.generatedCase,
    driftAcknowledged: plan.driftAcknowledged,
    changeRequests: plan.changeRequests,
    approved: plan.approved,
    completed: plan.completed,
    reviewStatus: plan.reviewStatus,
    reviewComment: plan.reviewComment,
    approvedBy: plan.approvedBy,
    approvedAt: plan.approvedAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
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
  };
}

/** Client-side pre-check so users get immediate, specific feedback. */
export function checkDraftSavable(draft: EditorDraft): LifecycleError | null {
  if (!hasCompleteCase(draft.sustainabilityCase)) {
    return "case_incomplete";
  }

  if (!draft.actionPlan) {
    return "not_generated";
  }

  return draft.actionPlan.recommendedOperationalActions.some(
    (item) => item.action.trim() === "",
  )
    ? "blank_action"
    : null;
}

/** A recorded AI generation, as read back from the server's own record. */
export type VerifiedGeneration = {
  input: SustainabilityCaseInput;
  output: AIActionPlan;
};

/** Builds a brand-new, unapproved plan from validated content. */
export function createPlanFromContent(
  content: PlanContent,
  {
    id,
    now,
    generatedAt,
    generation,
    createdBy = null,
  }: {
    id: string;
    now: string;
    generatedAt: string | null;
    /** The recorded generation the content claims to come from, if any. */
    generation: VerifiedGeneration | null;
    createdBy?: ActorRef | null;
  },
): LifecycleResult {
  if (!content.actionPlan) {
    return { ok: false, error: "not_generated" };
  }

  let actionPlan: AIActionPlan;

  if (generation) {
    // The plan is whatever the server recorded, not whatever the client sent.
    if (!deepEqual(content.actionPlan, generation.output)) {
      return { ok: false, error: "plan_differs_from_generation" };
    }

    actionPlan = generation.output;
  } else {
    actionPlan = asHumanAuthored(content.actionPlan);
  }

  const items = actionPlan.recommendedOperationalActions;

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    return { ok: false, error: "invalid_actions" };
  }

  if (items.some((item) => item.action.trim() === "")) {
    return { ok: false, error: "blank_action" };
  }

  return {
    ok: true,
    plan: {
      id,
      title: getPlanTitle(content.sustainabilityCase),
      ...content,
      actionPlan,
      originalAiOutput: generation ? actionPlan : null,
      generatedCase: generation ? generation.input : null,
      driftAcknowledged: false,
      changeRequests: [],
      approvedVersion: null,
      governanceReview: buildGovernanceReview({
        approved: false,
        completed: false,
        generatedAt: generatedAt ?? now,
      }),
      version: 1,
      approved: false,
      completed: false,
      reviewStatus: "none",
      reviewComment: null,
      createdBy,
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

const FIELDS_LOCKED_AFTER_APPROVAL = [
  "sustainabilityCase",
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
 * - approved: only action progress and KPI progress
 * - completed: nothing in the plan (implementation notes are separate rows)
 *
 * Editing the plan does not answer a reviewer's change request; that takes an
 * explicit `resubmit` with a response to each request, so an unrelated edit
 * can never silently clear a reviewer's concern.
 */
export function applyContentUpdate(
  existing: StoredActionPlan,
  content: PlanContent,
  {
    now,
    generatedAt,
    generation,
  }: {
    now: string;
    generatedAt: string | null;
    /** The recorded generation, when the content names a new one. */
    generation: VerifiedGeneration | null;
  },
): LifecycleResult {
  if (!content.actionPlan) {
    return { ok: false, error: "not_generated" };
  }

  const existingContent = planToContent(existing);

  if (existing.approved || existing.completed) {
    const lockedFieldChanged =
      FIELDS_LOCKED_AFTER_APPROVAL.some(
        (field) => !deepEqual(existingContent[field], content[field]),
      ) ||
      !deepEqual(
        coreActionView(existingContent.actionPlan),
        coreActionView(content.actionPlan),
      );
    const progressChanged =
      !deepEqual(existing.kpiProgress, content.kpiProgress) ||
      !deepEqual(
        trackingView(existingContent.actionPlan),
        trackingView(content.actionPlan),
      );

    if (lockedFieldChanged || (existing.completed && progressChanged)) {
      return { ok: false, error: "plan_locked" };
    }
  }

  const generationChanged = existing.generationId !== content.generationId;

  if (generationChanged && !generation) {
    // Detaching a plan from the generation it came from would let its AI
    // claims outlive their record.
    return { ok: false, error: "generation_required" };
  }

  let actionPlan: AIActionPlan;

  if (generation) {
    if (!deepEqual(content.actionPlan, generation.output)) {
      return { ok: false, error: "plan_differs_from_generation" };
    }

    actionPlan = generation.output;
  } else {
    // Only the actions can be edited; the generated text and its retrieval
    // record belong to the generation.
    if (
      !existing.actionPlan ||
      !deepEqual(
        generatedText(existing.actionPlan),
        generatedText(content.actionPlan),
      )
    ) {
      return { ok: false, error: "generated_text_locked" };
    }

    const normalized = normalizeActions(content.actionPlan, existing.actionPlan);

    if (!normalized.ok) {
      return { ok: false, error: normalized.error };
    }

    actionPlan = normalized.actionPlan;
  }

  const caseChanged = !deepEqual(
    existing.sustainabilityCase,
    content.sustainabilityCase,
  );
  const auditTimestamp = generationChanged
    ? (generatedAt ?? now)
    : existing.governanceReview.auditTimestamp;

  return {
    ok: true,
    plan: {
      ...existing,
      title: getPlanTitle(content.sustainabilityCase),
      ...content,
      actionPlan,
      // The baseline and the case it answered move only with a new generation.
      originalAiOutput: generation ? actionPlan : existing.originalAiOutput,
      generatedCase: generation ? generation.input : existing.generatedCase,
      // Editing the case again after acknowledging reopens the question.
      driftAcknowledged: generation
        ? false
        : caseChanged
          ? false
          : existing.driftAcknowledged,
      governanceReview: buildGovernanceReview({
        approved: existing.approved,
        completed: existing.completed,
        changesRequested: existing.reviewStatus === "changes_requested",
        generatedAt: auditTimestamp,
      }),
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
  };
}

export type TransitionOptions = {
  actor?: ActorRef | null;
  comment?: string | null;
};

/** Applies a lifecycle event to a plan, or explains why it is not allowed. */
export function transitionPlan(
  plan: StoredActionPlan,
  event: LifecycleEvent,
  now: string,
  { actor = null, comment = null }: TransitionOptions = {},
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

      if (plan.reviewStatus === "changes_requested") {
        return { ok: false, error: "changes_pending" };
      }

      if (getCaseDrift(plan) === "drifted") {
        return { ok: false, error: "needs_reassessment" };
      }

      // Separation of duties: the author of a plan cannot approve it.
      if (actor && plan.createdBy && plan.createdBy.id === actor.id) {
        return { ok: false, error: "self_approval_forbidden" };
      }

      if (!isReadyForApproval(plan)) {
        return { ok: false, error: "not_ready" };
      }

      return {
        ok: true,
        plan: {
          ...withApproval(plan, true, false, now),
          reviewStatus: "none",
          reviewComment: null,
          // `persistPlan` bumps the version by exactly one, so approval
          // takes effect in the version after this one.
          approvedVersion: plan.version + 1,
          approvedBy: actor,
          approvedAt: now,
          governanceReview: buildGovernanceReview({
            approved: true,
            completed: false,
            generatedAt: plan.governanceReview.auditTimestamp,
          }),
        },
      };
    }

    case "request_changes": {
      if (!plan.actionPlan) {
        return { ok: false, error: "not_generated" };
      }

      if (plan.completed) {
        return { ok: false, error: "already_completed" };
      }

      if (plan.approved) {
        return { ok: false, error: "already_approved" };
      }

      if (!comment || comment.trim().length === 0) {
        return { ok: false, error: "comment_required" };
      }

      return {
        ok: true,
        plan: {
          ...plan,
          reviewStatus: "changes_requested",
          reviewComment: comment.trim(),
          updatedAt: now,
          governanceReview: buildGovernanceReview({
            approved: false,
            completed: false,
            changesRequested: true,
            generatedAt: plan.governanceReview.auditTimestamp,
          }),
        },
      };
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

      return {
        ok: true,
        plan: {
          ...withApproval(plan, false, false, now),
          approvedVersion: null,
          approvedBy: null,
          approvedAt: null,
        },
      };
    }

    case "acknowledge_drift": {
      if (plan.approved || plan.completed) {
        return { ok: false, error: "already_approved" };
      }

      if (getCaseDrift(plan) !== "drifted") {
        return { ok: false, error: "no_drift" };
      }

      if (!comment || comment.trim().length === 0) {
        return { ok: false, error: "comment_required" };
      }

      return {
        ok: true,
        plan: { ...plan, driftAcknowledged: true, updatedAt: now },
      };
    }

    case "resubmit": {
      if (plan.approved || plan.completed) {
        return { ok: false, error: "already_approved" };
      }

      if (plan.reviewStatus !== "changes_requested") {
        return { ok: false, error: "no_open_request" };
      }

      return {
        ok: true,
        plan: {
          ...plan,
          reviewStatus: "none",
          reviewComment: null,
          updatedAt: now,
          governanceReview: buildGovernanceReview({
            approved: false,
            completed: false,
            generatedAt: plan.governanceReview.auditTimestamp,
          }),
        },
      };
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

import type {
  AIActionPlan,
  ActionStatus,
  CaseDrift,
  StoredAction,
  SustainabilityCaseInput,
} from "@/lib/schemas/action-plan";
import type { Role } from "./permissions";

/**
 * Rules for the individual actions inside a plan. Pure and shared: the server
 * is the authority, the editor uses the same functions for fast feedback.
 */

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  open: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export type ActionItemError =
  | "blank_action"
  | "invalid_actions"
  | "blocked_reason_required";

/** A person who could be given an action: a role plus, for department managers, a department. */
export type AssigneeCandidate = {
  id: string;
  role: Role;
  department: string | null;
};

/**
 * Who may be assigned an action in a plan of `department`. Reviewers approve
 * plans and so must not also implement them; a department manager only works
 * in their own department. (Property-level membership arrives with real
 * property entities; today a person's scope is their department.)
 */
export function isEligibleAssignee(
  candidate: AssigneeCandidate,
  department: string,
) {
  if (candidate.role === "sustainability_manager") {
    return true;
  }

  return (
    candidate.role === "department_manager" &&
    candidate.department === department
  );
}

/**
 * The part of an action only the plan's author may change: what it says, who
 * does it and by when. Locked once the plan is approved.
 */
export function coreActionView(actionPlan: AIActionPlan | null) {
  if (!actionPlan) {
    return null;
  }

  return {
    ...actionPlan,
    recommendedOperationalActions: actionPlan.recommendedOperationalActions.map(
      (item) => ({
        id: item.id,
        action: item.action,
        sourceIds: item.sourceIds,
        assigneeId: item.assigneeId,
        dueDate: item.dueDate,
      }),
    ),
  };
}

/** The part people doing the work update: progress and blockers. */
export function trackingView(actionPlan: AIActionPlan | null) {
  return (
    actionPlan?.recommendedOperationalActions.map((item) => ({
      id: item.id,
      status: item.status,
      blockedReason: item.blockedReason,
    })) ?? null
  );
}

/**
 * Validates an edited plan's actions and decides the fields the client may
 * not set.
 *
 * A person may change what an action says, who does it, when, and its
 * progress. Everything about *provenance* belongs to the server: an existing
 * action keeps the origin, sources, claim and evidence it had; a new action is
 * `human`, cites nothing and is a plain proposal. If a person rewords an
 * action the AI had classified as a policy requirement, the quotation no
 * longer vouches for the new words, so it drops to a proposal.
 */
export function normalizeActions(
  actionPlan: AIActionPlan,
  existing: AIActionPlan,
):
  | { ok: true; actionPlan: AIActionPlan }
  | { ok: false; error: ActionItemError } {
  const actions = actionPlan.recommendedOperationalActions;

  if (new Set(actions.map((item) => item.id)).size !== actions.length) {
    return { ok: false, error: "invalid_actions" };
  }

  const previous = new Map(
    existing.recommendedOperationalActions.map((item) => [item.id, item]),
  );
  const normalized: StoredAction[] = [];

  for (const item of actions) {
    if (item.action.trim() === "") {
      return { ok: false, error: "blank_action" };
    }

    if (item.status === "blocked" && item.blockedReason.trim() === "") {
      return { ok: false, error: "blocked_reason_required" };
    }

    const prior = previous.get(item.id);
    const tracking = {
      id: item.id,
      action: item.action,
      assigneeId: item.assigneeId,
      dueDate: item.dueDate,
      status: item.status,
      // A reason only means something while the action is blocked.
      blockedReason: item.status === "blocked" ? item.blockedReason.trim() : "",
    };

    if (!prior) {
      normalized.push({
        ...tracking,
        origin: "human",
        sourceIds: [],
        claimType: "proposal",
        evidence: null,
        downgradeReason: null,
      });
      continue;
    }

    const reworded =
      prior.action !== item.action && prior.claimType === "policy_requirement";

    normalized.push({
      ...tracking,
      origin: prior.origin,
      sourceIds: prior.sourceIds,
      claimType: reworded ? "proposal" : prior.claimType,
      evidence: reworded ? null : prior.evidence,
      downgradeReason: reworded ? "text_edited" : prior.downgradeReason,
    });
  }

  return {
    ok: true,
    actionPlan: { ...actionPlan, recommendedOperationalActions: normalized },
  };
}

/**
 * A plan that did not come from a recorded generation has no AI provenance to
 * vouch for: every action is the author's own, cites nothing, and the
 * retrieval record is empty. (Plans in the product always come from a
 * generation; this keeps the API from being a way to launder claims.)
 */
export function asHumanAuthored(actionPlan: AIActionPlan): AIActionPlan {
  return {
    ...actionPlan,
    recommendedOperationalActions: actionPlan.recommendedOperationalActions.map(
      (item) => ({
        ...item,
        origin: "human" as const,
        sourceIds: [],
        claimType: "proposal" as const,
        evidence: null,
        downgradeReason: null,
      }),
    ),
    sources: [],
    grounding: { status: "ungrounded", retrievedCount: 0 },
  };
}

/** The generated text that people may not edit: everything but the actions. */
export function generatedText(actionPlan: AIActionPlan) {
  return { ...actionPlan, recommendedOperationalActions: undefined };
}

const CASE_FIELD_LABELS: Record<keyof SustainabilityCaseInput, string> = {
  property: "Property",
  department: "Department",
  issue: "Sustainability issue",
  currentMetric: "Current metric",
  targetMetric: "Target metric",
  operationalContext: "Operational context",
};

/** Which parts of the case differ from the case the AI generated from. */
export function changedCaseFields(
  generated: SustainabilityCaseInput | null,
  current: SustainabilityCaseInput,
): string[] {
  if (!generated) {
    return [];
  }

  return (
    Object.keys(CASE_FIELD_LABELS) as (keyof SustainabilityCaseInput)[]
  )
    .filter((key) => generated[key] !== current[key])
    .map((key) => CASE_FIELD_LABELS[key]);
}

/**
 * Has the case been edited since the AI generated this plan? A plan whose case
 * changed describes a situation that no longer exists, so approval waits for
 * a regeneration or a person's explicit acknowledgement.
 */
export function getCaseDrift(plan: {
  sustainabilityCase: SustainabilityCaseInput;
  generatedCase: SustainabilityCaseInput | null;
  driftAcknowledged: boolean;
}): CaseDrift {
  if (changedCaseFields(plan.generatedCase, plan.sustainabilityCase).length === 0) {
    return "none";
  }

  return plan.driftAcknowledged ? "acknowledged" : "drifted";
}

export type ActionChange =
  | { kind: "added"; id: string; action: string }
  | { kind: "removed"; id: string; action: string }
  | { kind: "edited"; id: string; before: string; after: string }
  | {
      kind: "tracking";
      id: string;
      action: string;
      field:
        "status" | "assigneeId" | "dueDate" | "blockedReason" | "sourceIds";
      before: string;
      after: string;
    };

/** What changed between two versions of a plan's actions, matched by id. */
export function diffActions(
  before: AIActionPlan | null,
  after: AIActionPlan | null,
): ActionChange[] {
  const from = new Map(
    (before?.recommendedOperationalActions ?? []).map((item) => [
      item.id,
      item,
    ]),
  );
  const to = new Map(
    (after?.recommendedOperationalActions ?? []).map((item) => [item.id, item]),
  );
  const changes: ActionChange[] = [];

  for (const [id, item] of to) {
    const prior = from.get(id);

    if (!prior) {
      changes.push({ kind: "added", id, action: item.action });
      continue;
    }

    if (prior.action !== item.action) {
      changes.push({
        kind: "edited",
        id,
        before: prior.action,
        after: item.action,
      });
    }

    for (const field of [
      "status",
      "assigneeId",
      "dueDate",
      "blockedReason",
    ] as const) {
      const was = prior[field] ?? "";
      const now = item[field] ?? "";

      if (was !== now) {
        changes.push({
          kind: "tracking",
          id,
          action: item.action,
          field,
          before: was,
          after: now,
        });
      }
    }

    if (prior.sourceIds.join(",") !== item.sourceIds.join(",")) {
      changes.push({
        kind: "tracking",
        id,
        action: item.action,
        field: "sourceIds",
        before: prior.sourceIds.join(", "),
        after: item.sourceIds.join(", "),
      });
    }
  }

  for (const [id, item] of from) {
    if (!to.has(id)) {
      changes.push({ kind: "removed", id, action: item.action });
    }
  }

  return changes;
}

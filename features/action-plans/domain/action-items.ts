import type {
  AIActionPlan,
  ActionStatus,
  StoredAction,
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
  | "unknown_source"
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
 * Validates the shape-level invariants of a plan's actions and decides each
 * action's origin.
 *
 * Origin is the server's call, never the client's:
 * - an action that already existed keeps the origin it had;
 * - a new action in an existing plan is `human`;
 * - when the plan's content comes from a fresh generation (a new plan, or a
 *   regeneration) everything in it is `ai`.
 *
 * Until generation output is stored server-side and compared (planned with
 * provenance), "fresh generation" is established by the generation id
 * changing, which is the strongest signal available here.
 */
export function normalizeActions(
  actionPlan: AIActionPlan,
  existing: AIActionPlan | null,
  { regenerated }: { regenerated: boolean },
):
  | { ok: true; actionPlan: AIActionPlan }
  | { ok: false; error: ActionItemError } {
  const actions = actionPlan.recommendedOperationalActions;
  const ids = new Set(actions.map((item) => item.id));

  if (ids.size !== actions.length) {
    return { ok: false, error: "invalid_actions" };
  }

  const knownSources = new Set(actionPlan.sources.map((source) => source.id));
  const previous = new Map(
    (existing?.recommendedOperationalActions ?? []).map((item) => [
      item.id,
      item,
    ]),
  );

  const normalized: StoredAction[] = [];

  for (const item of actions) {
    if (item.action.trim() === "") {
      return { ok: false, error: "blank_action" };
    }

    if (item.sourceIds.some((id) => !knownSources.has(id))) {
      return { ok: false, error: "unknown_source" };
    }

    if (item.status === "blocked" && item.blockedReason.trim() === "") {
      return { ok: false, error: "blocked_reason_required" };
    }

    const origin = regenerated
      ? "ai"
      : (previous.get(item.id)?.origin ?? "human");

    normalized.push({
      ...item,
      origin,
      // A reason only means something while the action is blocked.
      blockedReason: item.status === "blocked" ? item.blockedReason.trim() : "",
    });
  }

  return {
    ok: true,
    actionPlan: { ...actionPlan, recommendedOperationalActions: normalized },
  };
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

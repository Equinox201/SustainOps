import type { EditorDraft } from "../types";
import { can, type Principal } from "./permissions";

/**
 * What the signed-in user may do with the plan open in the editor.
 *
 * This only decides what the UI offers. The server re-checks every action, so
 * hiding a control here is a convenience, never the security boundary.
 */
export function getEditorCapabilities(user: Principal, draft: EditorDraft) {
  const scope = { sustainabilityCase: draft.sustainabilityCase };
  const isSaved = draft.id !== null;
  const hasPlan = draft.actionPlan !== null;
  const open = !draft.approved && !draft.completed;

  const canEditCore = can(user, "plan:edit", scope) && !draft.approved;
  const canEditKpi = can(user, "plan:kpi", scope) && !draft.completed;
  const canEditNotes = can(user, "plan:notes", scope) && draft.approved;

  return {
    canEditCore,
    canEditKpi,
    canEditNotes,
    canGenerate: can(user, "plan:generate") && !draft.approved,
    canSave: hasPlan && (canEditCore || canEditKpi || canEditNotes),
    canApprove: can(user, "plan:approve", scope) && hasPlan && isSaved && open,
    canRequestChanges:
      can(user, "plan:request_changes", scope) && hasPlan && isSaved && open,
    canComplete:
      can(user, "plan:complete", scope) && draft.approved && !draft.completed,
    canResetApproval:
      can(user, "plan:reset_approval", scope) &&
      draft.approved &&
      !draft.completed,
  };
}

export type EditorCapabilities = ReturnType<typeof getEditorCapabilities>;

import type { EditorDraft } from "../types";
import { getCaseDrift } from "./action-items";
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
  // Progress and blockers on actions: open to the people doing the work, and
  // still possible once approved.
  const canTrack = can(user, "plan:track", scope) && !draft.completed;
  // Notes are separate, append-only rows (not part of the draft), added once
  // a plan is approved and implementation starts.
  const canAddNotes = can(user, "plan:notes", scope) && draft.approved;
  // What actions say, who does them and when: only after the first save, so
  // the AI's output is recorded before anyone edits it.
  const canEditActions = canEditCore && isSaved && hasPlan;
  const hasOpenRequest = draft.reviewStatus === "changes_requested";
  const drift = getCaseDrift(draft);

  return {
    canEditCore,
    canEditKpi,
    canTrack,
    canAddNotes,
    canEditActions,
    canGenerate: can(user, "plan:generate") && !draft.approved,
    canSave: hasPlan && (canEditCore || canEditKpi || canTrack),
    canApprove:
      can(user, "plan:approve", scope) &&
      hasPlan &&
      isSaved &&
      open &&
      !hasOpenRequest &&
      drift !== "drifted",
    canRequestChanges:
      can(user, "plan:request_changes", scope) && hasPlan && isSaved && open,
    canAcknowledgeDrift:
      can(user, "plan:edit", scope) && isSaved && open && drift === "drifted",
    canViewDiagnostics:
      can(user, "audit:view") && isSaved && draft.generationId !== null,
    canResubmit:
      can(user, "plan:resubmit", scope) && isSaved && open && hasOpenRequest,
    canComplete:
      can(user, "plan:complete", scope) && draft.approved && !draft.completed,
    canResetApproval:
      can(user, "plan:reset_approval", scope) &&
      draft.approved &&
      !draft.completed,
  };
}

export type EditorCapabilities = ReturnType<typeof getEditorCapabilities>;

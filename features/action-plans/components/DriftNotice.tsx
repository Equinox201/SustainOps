import { useState } from "react";
import { changedCaseFields, getCaseDrift } from "../domain/action-items";
import type { EditorDraft } from "../types";
import { fieldClassName, secondaryButtonClassName } from "./form-styles";

/**
 * Shown when the case has been edited since the AI generated the plan. The
 * plan then describes a situation that may no longer exist, so approval waits
 * for a regeneration or for the author to say, in writing, that it still holds.
 */
export function DriftNotice({
  draft,
  canAcknowledge,
  isSaving,
  onAcknowledge,
}: {
  draft: EditorDraft;
  canAcknowledge: boolean;
  isSaving: boolean;
  onAcknowledge: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const drift = getCaseDrift(draft);

  if (drift === "none") {
    return null;
  }

  const changed = changedCaseFields(
    draft.generatedCase,
    draft.sustainabilityCase,
  );

  if (drift === "acknowledged") {
    return (
      <p className="mt-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
        The case changed after this plan was generated ({changed.join(", ")}).
        The author accepted the plan as it stands.
      </p>
    );
  }

  return (
    <div
      role="status"
      className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
    >
      <p className="font-semibold">This plan may be out of date</p>
      <p>
        The case was edited after the AI generated it: {changed.join(", ")}.
        Regenerate the plan, or confirm that it still applies. Approval is
        blocked until one of these is done.
      </p>
      {canAcknowledge ? (
        <div className="mt-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
              Why the plan still applies
            </span>
            <textarea
              className={`${fieldClassName} min-h-16 resize-y bg-white`}
              value={reason}
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            className={`${secondaryButtonClassName} mt-2`}
            type="button"
            disabled={isSaving || reason.trim() === ""}
            onClick={() => {
              onAcknowledge(reason);
              setReason("");
            }}
          >
            Confirm the plan still applies
          </button>
        </div>
      ) : null}
    </div>
  );
}

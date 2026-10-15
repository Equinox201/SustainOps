import type { EditorCapabilities } from "../domain/capabilities";
import type { EditorDraft } from "../types";
import { PlanStateBadges } from "./PlanStateBadges";

export function EditorToolbar({
  draft,
  capabilities,
  isSaving,
  onBack,
  onSave,
  onApprove,
  onComplete,
  onResetApproval,
}: {
  draft: EditorDraft;
  capabilities: EditorCapabilities;
  isSaving: boolean;
  onBack: () => void;
  onSave: () => void;
  onApprove: () => void;
  onComplete: () => void;
  onResetApproval: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-5 border-b border-stone-200 bg-[#f7f3ec]/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 rounded-lg border border-stone-200 bg-white/95 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
            type="button"
            onClick={onBack}
          >
            Back to Action Plans
          </button>
          <PlanStateBadges draft={draft} />
        </div>

        <div className="flex flex-wrap gap-2">
          {capabilities.canSave ? (
            <button
              className="rounded-lg border border-stone-950 bg-stone-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-300"
              type="button"
              onClick={onSave}
              disabled={isSaving}
            >
              Save Action Plan
            </button>
          ) : null}
          {capabilities.canApprove ? (
            <button
              className="rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={onApprove}
              disabled={isSaving}
            >
              Approve
            </button>
          ) : null}
          {capabilities.canComplete ? (
            <button
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={onComplete}
              disabled={isSaving}
            >
              Mark Done
            </button>
          ) : null}
          {capabilities.canResetApproval ? (
            <button
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={onResetApproval}
              disabled={isSaving}
            >
              Reset Approval
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

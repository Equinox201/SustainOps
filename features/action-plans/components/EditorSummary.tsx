import type { EditorCapabilities } from "../domain/capabilities";
import { getPlanTitle } from "../domain/plan-utils";
import type { EditorDraft } from "../types";
import { primaryButtonClassName } from "./form-styles";
import { LockedNotice } from "./LockedNotice";
import { PlanStateBadges } from "./PlanStateBadges";
import { ReviewPanel } from "./ReviewPanel";

export function EditorSummary({
  draft,
  capabilities,
  errorMessage,
  successMessage,
  isGenerating,
  isSaving,
  hasConflict,
  onGenerate,
  onReloadLatest,
  onRequestChanges,
}: {
  draft: EditorDraft;
  capabilities: EditorCapabilities;
  errorMessage: string | null;
  successMessage: string | null;
  isGenerating: boolean;
  isSaving: boolean;
  hasConflict: boolean;
  onGenerate: () => void;
  onReloadLatest: () => void;
  onRequestChanges: (comment: string) => void;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
            Action Plan Editor
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950">
            {getPlanTitle(draft.sustainabilityCase)}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <PlanStateBadges draft={draft} />
        </div>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900"
        >
          <p>{errorMessage}</p>
          {hasConflict ? (
            <button
              className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-900 hover:bg-rose-100"
              type="button"
              onClick={onReloadLatest}
            >
              Load the latest version (discards your unsaved edits)
            </button>
          ) : null}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
          {successMessage}
        </div>
      ) : null}

      <p className="mt-5 text-sm leading-6 text-stone-600">
        AI recommendations are decision support: a reviewer must approve before
        anything is implemented, and approved plans are locked.
      </p>

      {draft.approved ? <LockedNotice /> : null}

      <ReviewPanel
        draft={draft}
        canRequestChanges={capabilities.canRequestChanges}
        isSaving={isSaving}
        onRequestChanges={onRequestChanges}
      />

      {capabilities.canGenerate ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            className={primaryButtonClassName}
            type="button"
            onClick={onGenerate}
            disabled={isGenerating || isSaving}
          >
            {isGenerating
              ? "Generating action plan..."
              : draft.actionPlan
                ? "Regenerate Action Plan"
                : "Generate Action Plan"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

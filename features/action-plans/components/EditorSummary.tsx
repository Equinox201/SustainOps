import { getPlanTitle } from "../domain/plan-utils";
import type { EditorDraft } from "../types";
import { primaryButtonClassName, secondaryButtonClassName } from "./form-styles";
import { LockedNotice } from "./LockedNotice";
import { PlanStateBadges } from "./PlanStateBadges";

export function EditorSummary({
  draft,
  errorMessage,
  successMessage,
  isGenerating,
  onGenerate,
  onApprove,
  onComplete,
}: {
  draft: EditorDraft;
  errorMessage: string | null;
  successMessage: string | null;
  isGenerating: boolean;
  onGenerate: () => void;
  onApprove: () => void;
  onComplete: () => void;
}) {
  const canApprove = Boolean(draft.actionPlan) && !draft.approved;
  const canComplete = draft.approved && !draft.completed;

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
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
        <p>AI recommendations require human review before implementation.</p>
        <p>Approval is gated by operational readiness.</p>
        <p>
          AI recommendations must be assigned to an owner before implementation.
        </p>
        <p>
          KPI progress helps track whether the action plan is creating
          measurable impact.
        </p>
        <p>Approved plans are locked to protect the operational record.</p>
        <p>Implementation notes are available after approval.</p>
      </div>

      {draft.approved ? <LockedNotice /> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          className={primaryButtonClassName}
          type="button"
          onClick={onGenerate}
          disabled={isGenerating || draft.approved}
        >
          {isGenerating
            ? "Generating action plan..."
            : draft.actionPlan
              ? "Regenerate Action Plan"
              : "Generate Action Plan"}
        </button>
        {canApprove ? (
          <button
            className={secondaryButtonClassName}
            type="button"
            onClick={onApprove}
          >
            Mark Approved
          </button>
        ) : null}
        {canComplete ? (
          <button
            className={secondaryButtonClassName}
            type="button"
            onClick={onComplete}
          >
            Mark Done
          </button>
        ) : null}
      </div>
    </div>
  );
}

import { readinessChecklistItems } from "../constants";
import type { EditorDraft } from "../types";

export function ReadinessChecklist({
  draft,
  onDraftChange,
  disabled,
}: {
  draft: EditorDraft;
  onDraftChange: (draft: EditorDraft) => void;
  disabled: boolean;
}) {
  return (
    <section className="mt-5 rounded-lg border border-stone-200 bg-white p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
          Readiness Checklist
        </p>
        <h4 className="mt-1 text-lg font-semibold text-stone-950">
          Approval readiness gate
        </h4>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Approval is gated by operational readiness. AI recommendations must be
          assigned to an owner before implementation.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {readinessChecklistItems.map((item) => (
          <label
            key={item.field}
            className="flex items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700"
          >
            <input
              className="mt-1 h-4 w-4 rounded border-stone-300 accent-emerald-800 disabled:cursor-not-allowed"
              type="checkbox"
              checked={draft.readinessChecklist[item.field]}
              disabled={disabled}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  readinessChecklist: {
                    ...draft.readinessChecklist,
                    [item.field]: event.target.checked,
                  },
                })
              }
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>

      {draft.approved ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
          Approval confirms this plan is ready for operational implementation.
        </p>
      ) : null}
    </section>
  );
}

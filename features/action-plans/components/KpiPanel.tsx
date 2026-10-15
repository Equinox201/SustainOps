import type { KPIProgress } from "@/lib/types";
import type { EditorDraft } from "../types";
import { Field } from "./Field";
import { fieldClassName, inputClassName } from "./form-styles";

export function KpiPanel({
  draft,
  onDraftChange,
  disabled,
  disabledReason,
}: {
  draft: EditorDraft;
  onDraftChange: (draft: EditorDraft) => void;
  disabled: boolean;
  disabledReason?: string;
}) {
  function updateField(field: keyof KPIProgress, value: string) {
    onDraftChange({
      ...draft,
      kpiProgress: {
        ...draft.kpiProgress,
        [field]: value,
      },
    });
  }

  return (
    <>
      {disabled ? (
        <div className="mb-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
          {disabledReason ?? "KPI progress is read-only."}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Baseline">
          <input
            className={inputClassName}
            type="text"
            value={draft.kpiProgress.baseline}
            disabled={disabled}
            placeholder="1,000 kg laundry/week"
            onChange={(event) => updateField("baseline", event.target.value)}
          />
        </Field>

        <Field label="Current">
          <input
            className={inputClassName}
            type="text"
            value={draft.kpiProgress.current}
            disabled={disabled}
            placeholder="1,180 kg laundry/week"
            onChange={(event) => updateField("current", event.target.value)}
          />
        </Field>

        <Field label="Target" className="md:col-span-2">
          <input
            className={inputClassName}
            type="text"
            value={draft.kpiProgress.target}
            disabled={disabled}
            placeholder="Return to 1,000 kg/week within 60 days"
            onChange={(event) => updateField("target", event.target.value)}
          />
        </Field>

        <Field label="Latest Update" className="md:col-span-2">
          <textarea
            className={`${fieldClassName} min-h-28 resize-y`}
            value={draft.kpiProgress.latestUpdate}
            disabled={disabled}
            placeholder="Week 1: Laundry volume reduced by 4% after renewed towel reuse briefing."
            onChange={(event) =>
              updateField("latestUpdate", event.target.value)
            }
          />
        </Field>
      </div>
    </>
  );
}

import type { StoredActionPlan } from "@/lib/types";
import type { EditorDraft } from "../types";
import { Field } from "./Field";
import { inputClassName } from "./form-styles";

export function AccountabilityFields({
  draft,
  onDraftChange,
  disabled,
}: {
  draft: EditorDraft;
  onDraftChange: (draft: EditorDraft) => void;
  disabled: boolean;
}) {
  return (
    <section className="mt-6 rounded-lg border border-stone-200 bg-[#fbfaf7] p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
          Accountability
        </p>
        <h4 className="mt-1 text-lg font-semibold text-stone-950">
          Owner and review timeline
        </h4>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Assigning an owner and review timeline helps convert AI
          recommendations into accountable operational follow-up.
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Owner">
          <input
            className={inputClassName}
            type="text"
            value={draft.owner}
            disabled={disabled}
            onChange={(event) =>
              onDraftChange({ ...draft, owner: event.target.value })
            }
          />
        </Field>

        <Field label="Priority">
          <select
            className={inputClassName}
            value={draft.priority}
            disabled={disabled}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                priority: event.target.value as StoredActionPlan["priority"],
              })
            }
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </Field>

        <Field label="Target Date">
          <input
            className={inputClassName}
            type="date"
            value={draft.targetDate}
            disabled={disabled}
            onChange={(event) =>
              onDraftChange({ ...draft, targetDate: event.target.value })
            }
          />
        </Field>

        <Field label="Next Review Date">
          <input
            className={inputClassName}
            type="date"
            value={draft.nextReviewDate}
            disabled={disabled}
            onChange={(event) =>
              onDraftChange({ ...draft, nextReviewDate: event.target.value })
            }
          />
        </Field>
      </div>
    </section>
  );
}

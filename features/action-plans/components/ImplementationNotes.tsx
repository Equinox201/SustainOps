import type { EditorDraft } from "../types";
import { fieldClassName } from "./form-styles";

export function ImplementationNotes({
  draft,
  onDraftChange,
  disabled = false,
}: {
  draft: EditorDraft;
  onDraftChange: (draft: EditorDraft) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <label>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          Implementation Progress Notes
        </span>
        <textarea
          className={`${fieldClassName} min-h-40 resize-y`}
          value={draft.actionNotes}
          disabled={disabled}
          onChange={(event) =>
            onDraftChange({ ...draft, actionNotes: event.target.value })
          }
        />
      </label>
      <p className="mt-2 text-sm leading-6 text-stone-500">
        Use this space to record implementation progress, observations, and
        follow-up actions.
      </p>
    </>
  );
}

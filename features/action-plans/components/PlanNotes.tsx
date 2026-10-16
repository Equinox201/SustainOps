import { useState } from "react";
import { usePlanNotes } from "../hooks/usePlanNotes";
import { ROLE_LABELS, type Role } from "../domain/permissions";
import { formatDate } from "../domain/plan-utils";
import { fieldClassName, primaryButtonClassName } from "./form-styles";

/**
 * Implementation notes. Each is a separate, attributed, timestamped entry that
 * is only ever added: a later note can correct an earlier one but not erase it.
 */
export function PlanNotes({
  planId,
  canAdd,
}: {
  planId: string | null;
  canAdd: boolean;
}) {
  const { notes, error, isSaving, add } = usePlanNotes(planId);
  const [body, setBody] = useState("");

  return (
    <div>
      {notes.length === 0 ? (
        <p className="text-sm leading-6 text-stone-500">
          No notes yet. Notes record implementation progress, observations and
          follow-ups, and cannot be edited once added.
        </p>
      ) : (
        <ol className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-lg border border-stone-200 bg-white px-4 py-3"
            >
              <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800">
                {note.body}
              </p>
              <p className="mt-2 text-xs text-stone-500">
                {note.author
                  ? `${note.author.name} · ${ROLE_LABELS[note.author.role as Role] ?? note.author.role}`
                  : "Imported from the previous notes field"}{" "}
                · {formatDate(note.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      )}

      {error ? <p className="mt-3 text-sm text-rose-900">{error}</p> : null}

      {canAdd ? (
        <form
          className="mt-5"
          onSubmit={async (event) => {
            event.preventDefault();

            if (body.trim() && (await add(body.trim()))) {
              setBody("");
            }
          }}
        >
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Add a note
            </span>
            <textarea
              className={`${fieldClassName} min-h-24 resize-y`}
              value={body}
              maxLength={1000}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <button
            className={`${primaryButtonClassName} mt-3`}
            type="submit"
            disabled={isSaving || body.trim() === ""}
          >
            {isSaving ? "Adding..." : "Add note"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

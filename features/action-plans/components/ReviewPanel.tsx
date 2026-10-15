import { useState } from "react";
import type { EditorDraft } from "../types";
import { formatDate } from "../domain/plan-utils";
import { secondaryButtonClassName } from "./form-styles";

/** The reviewer's decision area, and what authors see when changes are asked. */
export function ReviewPanel({
  draft,
  canRequestChanges,
  isSaving,
  onRequestChanges,
}: {
  draft: EditorDraft;
  canRequestChanges: boolean;
  isSaving: boolean;
  onRequestChanges: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");

  return (
    <div className="mt-5 space-y-3">
      {draft.reviewStatus === "changes_requested" && draft.reviewComment ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <p className="font-semibold">Changes requested by the reviewer</p>
          <p className="mt-1">“{draft.reviewComment}”</p>
        </div>
      ) : null}

      {draft.approved && draft.approvedBy ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
          Approved by <strong>{draft.approvedBy.name}</strong>
          {draft.approvedAt ? ` on ${formatDate(draft.approvedAt)}` : ""}.
        </div>
      ) : null}

      {canRequestChanges ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Reviewer comment
            </span>
            <textarea
              className="mt-2 block min-h-24 w-full resize-y rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              value={comment}
              maxLength={1000}
              placeholder="What needs to change before this plan can be approved?"
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <button
            className={`${secondaryButtonClassName} mt-3`}
            type="button"
            disabled={isSaving}
            onClick={() => {
              onRequestChanges(comment);
              setComment("");
            }}
          >
            Request changes
          </button>
        </div>
      ) : null}
    </div>
  );
}

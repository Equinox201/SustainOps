import { useState } from "react";
import type { ChangeResponse } from "@/lib/schemas/action-plan";
import type { EditorDraft } from "../types";
import { formatDate } from "../domain/plan-utils";
import {
  fieldClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "./form-styles";

/**
 * Where review happens: the reviewer's decision, the open change requests, and
 * the author's answer to each. A request stays open until it is answered and
 * the plan is resubmitted; editing the plan does not close it.
 */
export function ReviewPanel({
  draft,
  canRequestChanges,
  canResubmit,
  isSaving,
  onRequestChanges,
  onResubmit,
}: {
  draft: EditorDraft;
  canRequestChanges: boolean;
  canResubmit: boolean;
  isSaving: boolean;
  onRequestChanges: (comment: string) => void;
  onResubmit: (responses: ChangeResponse[]) => void;
}) {
  const [comment, setComment] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const open = draft.changeRequests.filter((r) => r.status === "open");
  const addressed = draft.changeRequests.filter(
    (r) => r.status === "addressed",
  );
  const allAnswered =
    open.length > 0 && open.every((r) => (answers[r.id] ?? "").trim() !== "");

  return (
    <div className="mt-5 space-y-3">
      {draft.reviewStatus === "changes_requested" ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <p className="font-semibold">Changes requested by the reviewer</p>
          {open.length === 0 && draft.reviewComment ? (
            <p className="mt-1">“{draft.reviewComment}”</p>
          ) : null}
          <ol className="mt-2 space-y-3">
            {open.map((request) => (
              <li key={request.id}>
                <p>
                  “{request.comment}”
                  <span className="ml-2 text-xs text-amber-900">
                    {request.requestedBy.name} ·{" "}
                    {formatDate(request.requestedAt)}
                  </span>
                </p>
                {canResubmit ? (
                  <label className="mt-2 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
                      Your response
                    </span>
                    <textarea
                      className={`${fieldClassName} min-h-16 resize-y bg-white`}
                      value={answers[request.id] ?? ""}
                      maxLength={500}
                      placeholder="What did you change, or why not?"
                      onChange={(event) =>
                        setAnswers({
                          ...answers,
                          [request.id]: event.target.value,
                        })
                      }
                    />
                  </label>
                ) : null}
              </li>
            ))}
          </ol>
          {canResubmit ? (
            <button
              className={`${primaryButtonClassName} mt-3`}
              type="button"
              disabled={isSaving || !allAnswered}
              onClick={() =>
                onResubmit(
                  open.map((request) => ({
                    requestId: request.id,
                    response: (answers[request.id] ?? "").trim(),
                  })),
                )
              }
            >
              Resubmit for review
            </button>
          ) : (
            <p className="mt-2 text-xs text-amber-900">
              The author answers each request and resubmits before this plan can
              be approved.
            </p>
          )}
        </div>
      ) : null}

      {addressed.length > 0 ? (
        <details className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
          <summary className="cursor-pointer font-semibold text-stone-900">
            Earlier change requests ({addressed.length})
          </summary>
          <ul className="mt-2 space-y-3">
            {addressed.map((request) => (
              <li key={request.id}>
                <p>
                  “{request.comment}”{" "}
                  <span className="text-xs text-stone-500">
                    {request.requestedBy.name}
                  </span>
                </p>
                <p className="text-stone-600">
                  Answered by {request.respondedBy?.name ?? "the author"}
                  {request.respondedAt
                    ? ` on ${formatDate(request.respondedAt)}`
                    : ""}
                  : “{request.response}”
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {draft.approved && draft.approvedBy ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
          Approved by <strong>{draft.approvedBy.name}</strong>
          {draft.approvedAt ? ` on ${formatDate(draft.approvedAt)}` : ""}
          {draft.approvedVersion ? ` (version ${draft.approvedVersion})` : ""}.
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

import type {
  AIActionPlan,
  ActionStatus,
  StoredAction,
} from "@/lib/schemas/action-plan";
import type { SessionUser } from "@/lib/schemas/action-plan";
import {
  ACTION_STATUS_LABELS,
  isEligibleAssignee,
} from "../domain/action-items";
import { LIMITS } from "@/lib/schemas/action-plan";
import { fieldClassName, secondaryButtonClassName } from "./form-styles";
import { SourceChips } from "./SourceChips";

const STATUSES: ActionStatus[] = ["open", "in_progress", "blocked", "done"];

const smallField = `${fieldClassName} mt-1 min-h-10 py-2`;

function OriginBadge({
  action,
  original,
}: {
  action: StoredAction;
  original: AIActionPlan | null;
}) {
  if (action.origin === "human") {
    return (
      <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-900">
        Added by a person
      </span>
    );
  }

  const before = original?.recommendedOperationalActions.find(
    (item) => item.id === action.id,
  );
  const edited = before !== undefined && before.action !== action.action;

  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
        edited
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-stone-200 bg-stone-100 text-stone-600"
      }`}
    >
      {edited ? "AI proposal, edited" : "AI proposal"}
    </span>
  );
}

/**
 * The plan's recommended actions. Each has its own identity, so changes can be
 * tracked per action: what it says and who does it by when (the author), and
 * its progress and blockers (the people doing the work).
 */
export function ActionList({
  actionPlan,
  original,
  department,
  people,
  canEdit,
  canTrack,
  onChange,
}: {
  actionPlan: AIActionPlan;
  original: AIActionPlan | null;
  department: string;
  people: SessionUser[];
  canEdit: boolean;
  canTrack: boolean;
  onChange: (actionPlan: AIActionPlan) => void;
}) {
  const actions = actionPlan.recommendedOperationalActions;
  const assignable = people.filter((person) =>
    isEligibleAssignee(person, department),
  );
  const nameOf = (id: string) =>
    people.find((person) => person.id === id)?.name ?? id;

  function replace(next: StoredAction[]) {
    onChange({ ...actionPlan, recommendedOperationalActions: next });
  }

  function patch(id: string, change: Partial<StoredAction>) {
    replace(
      actions.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  }

  function add() {
    replace([
      ...actions,
      {
        id: crypto.randomUUID(),
        action: "",
        sourceIds: [],
        origin: "human",
        status: "open",
        assigneeId: null,
        dueDate: "",
        blockedReason: "",
      },
    ]);
  }

  return (
    <div>
      <ul className="mt-3 space-y-4">
        {actions.map((item, index) => {
          const assigneeKnown = assignable.some(
            (person) => person.id === item.assigneeId,
          );

          return (
            <li
              key={item.id}
              className="rounded-lg border border-stone-200 bg-white p-4"
              data-testid="action-item"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <OriginBadge action={item} original={original} />
                {canEdit && actions.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-800 underline-offset-4 hover:underline"
                    onClick={() =>
                      replace(actions.filter((other) => other.id !== item.id))
                    }
                  >
                    Remove action
                  </button>
                ) : null}
              </div>

              {canEdit ? (
                <textarea
                  aria-label={`Action ${index + 1} text`}
                  className={`${fieldClassName} min-h-20 resize-y`}
                  value={item.action}
                  maxLength={LIMITS.aiItem}
                  onChange={(event) =>
                    patch(item.id, { action: event.target.value })
                  }
                />
              ) : (
                <p className="mt-3 text-sm leading-6 text-stone-700">
                  {item.action}
                </p>
              )}

              <SourceChips
                sourceIds={item.sourceIds}
                sources={actionPlan.sources}
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Assigned to
                  <select
                    className={smallField}
                    value={item.assigneeId ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      patch(item.id, { assigneeId: event.target.value || null })
                    }
                  >
                    <option value="">Unassigned</option>
                    {item.assigneeId && !assigneeKnown ? (
                      <option value={item.assigneeId}>
                        {nameOf(item.assigneeId)}
                      </option>
                    ) : null}
                    {assignable.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Due
                  <input
                    className={smallField}
                    type="date"
                    value={item.dueDate}
                    disabled={!canEdit}
                    onChange={(event) =>
                      patch(item.id, { dueDate: event.target.value })
                    }
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  Progress
                  <select
                    className={smallField}
                    value={item.status}
                    disabled={!canTrack}
                    onChange={(event) =>
                      patch(item.id, {
                        status: event.target.value as ActionStatus,
                      })
                    }
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {ACTION_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {item.status === "blocked" ? (
                <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  What is blocking this?
                  <input
                    className={smallField}
                    value={item.blockedReason}
                    maxLength={LIMITS.blockedReason}
                    disabled={!canTrack}
                    placeholder="Required while blocked"
                    onChange={(event) =>
                      patch(item.id, { blockedReason: event.target.value })
                    }
                  />
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canEdit && actions.length < LIMITS.actionItems ? (
        <button
          type="button"
          className={`${secondaryButtonClassName} mt-4`}
          onClick={add}
        >
          Add an action
        </button>
      ) : null}
      {!canEdit && actions.some((item) => item.assigneeId) ? (
        <p className="sr-only">
          Assigned:{" "}
          {actions
            .filter((item) => item.assigneeId)
            .map((item) => nameOf(item.assigneeId!))
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}

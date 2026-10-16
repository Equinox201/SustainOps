import { useMemo, useState } from "react";
import type { SessionUser } from "@/lib/schemas/action-plan";
import { ACTION_STATUS_LABELS } from "../domain/action-items";
import { ROLE_LABELS, type Role } from "../domain/permissions";
import { formatDate } from "../domain/plan-utils";
import { diffSnapshots } from "../domain/revisions";
import { usePlanRevisions, useRevisionPair } from "../hooks/usePlanRevisions";
import type { ActionChange } from "../domain/action-items";

const EVENT_LABELS: Record<string, string> = {
  action_plan_created: "Created",
  action_plan_updated: "Edited",
  action_plan_approved: "Approved",
  changes_requested: "Changes requested",
  plan_resubmitted: "Resubmitted",
  approval_reset: "Approval reset",
  action_plan_completed: "Marked done",
  migrated: "Baseline snapshot",
};

const FIELD_LABELS: Record<string, string> = {
  status: "Progress",
  assigneeId: "Assigned to",
  dueDate: "Due",
  blockedReason: "Blocked because",
  sourceIds: "Sources",
};

function describe(
  change: ActionChange,
  nameOf: (id: string) => string,
): string {
  switch (change.kind) {
    case "added":
      return `Added: “${change.action}”`;
    case "removed":
      return `Removed: “${change.action}”`;
    case "edited":
      return `Reworded: “${change.before}” → “${change.after}”`;
    case "tracking": {
      const format = (value: string) => {
        if (value === "") {
          return "—";
        }

        if (change.field === "status") {
          return (
            ACTION_STATUS_LABELS[value as keyof typeof ACTION_STATUS_LABELS] ??
            value
          );
        }

        return change.field === "assigneeId" ? nameOf(value) : value;
      };

      return `“${change.action}”: ${FIELD_LABELS[change.field]} ${format(change.before)} → ${format(change.after)}`;
    }
  }
}

/**
 * Every saved version of a plan, and a comparison between any two. Versions
 * are immutable snapshots written in the same transaction as each change.
 */
export function PlanRevisions({
  planId,
  version,
  approvedVersion,
  people,
}: {
  planId: string | null;
  version: number | null;
  approvedVersion: number | null;
  people: SessionUser[];
}) {
  const { revisions, error } = usePlanRevisions(planId, version);
  const [pick, setPick] = useState<{ from: number; to: number } | null>(null);

  const latest = revisions.at(-1)?.version ?? null;
  const previous = revisions.length > 1 ? revisions.at(-2)!.version : null;
  const from = pick?.from ?? previous;
  const to = pick?.to ?? latest;
  const { pair, error: pairError } = useRevisionPair(planId, from, to);
  const nameOf = (id: string) =>
    people.find((person) => person.id === id)?.name ?? id;

  const diff = useMemo(
    () => (pair ? diffSnapshots(pair.from.snapshot, pair.to.snapshot) : null),
    [pair],
  );

  if (error) {
    return <p className="text-sm text-rose-900">{error}</p>;
  }

  if (revisions.length === 0) {
    return (
      <p className="text-sm leading-6 text-stone-500">
        Save the plan to record its first version.
      </p>
    );
  }

  const options = revisions.map((revision) => (
    <option key={revision.version} value={revision.version}>
      v{revision.version} ·{" "}
      {EVENT_LABELS[revision.eventType] ?? revision.eventType}
      {revision.version === approvedVersion ? " (approved)" : ""}
    </option>
  ));

  return (
    <div>
      <ol className="space-y-2" aria-label="Versions">
        {revisions.map((revision) => (
          <li key={revision.version} className="text-sm text-stone-700">
            <span className="font-semibold text-stone-950">
              v{revision.version}
            </span>{" "}
            · {EVENT_LABELS[revision.eventType] ?? revision.eventType}
            {revision.version === approvedVersion ? (
              <span className="ml-2 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-900">
                approved
              </span>
            ) : null}
            <span className="text-stone-500">
              {" "}
              ·{" "}
              {revision.actor
                ? `${revision.actor.name} (${ROLE_LABELS[revision.actor.role as Role] ?? revision.actor.role})`
                : "System"}{" "}
              · {formatDate(revision.createdAt)}
            </span>
            {revision.reason ? (
              <span className="block text-stone-600">“{revision.reason}”</span>
            ) : null}
          </li>
        ))}
      </ol>

      {revisions.length > 1 && from !== null && to !== null ? (
        <section
          className="mt-5 rounded-lg border border-stone-200 bg-white p-4"
          aria-label="Compare versions"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
              From
              <select
                className="mt-1 block min-h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-stone-800"
                value={from}
                onChange={(event) =>
                  setPick({ from: Number(event.target.value), to })
                }
              >
                {options}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
              To
              <select
                className="mt-1 block min-h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-stone-800"
                value={to}
                onChange={(event) =>
                  setPick({ from, to: Number(event.target.value) })
                }
              >
                {options}
              </select>
            </label>
            {approvedVersion && latest && approvedVersion !== latest ? (
              <button
                type="button"
                className="min-h-10 rounded-lg border border-stone-300 px-3 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                onClick={() => setPick({ from: approvedVersion, to: latest })}
              >
                Changes since approval
              </button>
            ) : null}
          </div>

          {pairError ? (
            <p className="mt-3 text-sm text-rose-900">{pairError}</p>
          ) : null}

          {diff ? (
            diff.fields.length === 0 &&
            diff.actions.length === 0 &&
            !diff.planTextChanged ? (
              <p className="mt-3 text-sm text-stone-500">
                No differences between these versions.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
                {diff.fields.map((field) => (
                  <li key={field.label}>
                    <span className="font-semibold">{field.label}:</span>{" "}
                    {field.before} → {field.after}
                  </li>
                ))}
                {diff.actions.map((change, index) => (
                  <li key={`${change.id}-${index}`}>
                    {describe(change, nameOf)}
                  </li>
                ))}
                {diff.planTextChanged ? (
                  <li>The generated plan text was regenerated or edited.</li>
                ) : null}
              </ul>
            )
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

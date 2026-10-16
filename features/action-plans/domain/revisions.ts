import type { RevisionSnapshot } from "@/lib/types";
import { diffActions, type ActionChange } from "./action-items";
import { deepEqual } from "./deep-equal";

export type FieldChange = { label: string; before: string; after: string };

export type SnapshotDiff = {
  fields: FieldChange[];
  actions: ActionChange[];
  /** True when the AI-generated text (summary, causes, checklists...) differs. */
  planTextChanged: boolean;
};

const CASE_LABELS = {
  property: "Property",
  department: "Department",
  issue: "Issue",
  currentMetric: "Current metric",
  targetMetric: "Target metric",
  operationalContext: "Operational context",
} as const;

const READINESS_LABELS = {
  actionsAreSpecific: "Readiness: actions are specific",
  kpisAreMeasurable: "Readiness: KPIs are measurable",
  ownerAssigned: "Readiness: owner assigned",
  timelineDefined: "Readiness: timeline defined",
  privacyReviewed: "Readiness: privacy reviewed",
  staffMessageReady: "Readiness: staff message ready",
} as const;

const KPI_LABELS = {
  baseline: "KPI baseline",
  current: "KPI current",
  target: "KPI target",
  latestUpdate: "KPI latest update",
} as const;

const show = (value: string | boolean | null) =>
  value === null || value === ""
    ? "—"
    : value === true
      ? "yes"
      : value === false
        ? "no"
        : value;

/** What changed between two versions of a plan, in terms a reviewer can read. */
export function diffSnapshots(
  from: RevisionSnapshot,
  to: RevisionSnapshot,
): SnapshotDiff {
  const fields: FieldChange[] = [];
  const push = (
    label: string,
    before: string | boolean | null,
    after: string | boolean | null,
  ) => {
    if (before !== after) {
      fields.push({ label, before: show(before), after: show(after) });
    }
  };

  for (const key of Object.keys(CASE_LABELS) as (keyof typeof CASE_LABELS)[]) {
    push(
      CASE_LABELS[key],
      from.sustainabilityCase[key],
      to.sustainabilityCase[key],
    );
  }

  push("Owner", from.owner, to.owner);
  push("Priority", from.priority, to.priority);
  push("Target date", from.targetDate, to.targetDate);
  push("Next review date", from.nextReviewDate, to.nextReviewDate);

  for (const key of Object.keys(
    READINESS_LABELS,
  ) as (keyof typeof READINESS_LABELS)[]) {
    push(
      READINESS_LABELS[key],
      from.readinessChecklist[key],
      to.readinessChecklist[key],
    );
  }

  for (const key of Object.keys(KPI_LABELS) as (keyof typeof KPI_LABELS)[]) {
    push(KPI_LABELS[key], from.kpiProgress[key], to.kpiProgress[key]);
  }

  push("Approved", from.approved, to.approved);
  push("Done", from.completed, to.completed);
  push("Review status", from.reviewStatus, to.reviewStatus);

  const strip = (plan: RevisionSnapshot["actionPlan"]) =>
    plan ? { ...plan, recommendedOperationalActions: undefined } : null;

  return {
    fields,
    actions: diffActions(from.actionPlan, to.actionPlan),
    planTextChanged: !deepEqual(strip(from.actionPlan), strip(to.actionPlan)),
  };
}

import type { StoredActionPlan } from "@/lib/types";

/** What the list can be narrowed by. All fields are optional and AND-ed. */
export type PlanFilters = {
  property: string;
  department: string;
  status: "" | "pending" | "changes_requested" | "active" | "done";
  owner: string;
};

export const EMPTY_FILTERS: PlanFilters = {
  property: "",
  department: "",
  status: "",
  owner: "",
};

const STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "changes_requested",
  "active",
  "done",
]);

export const STATUS_LABELS: Record<
  Exclude<PlanFilters["status"], "">,
  string
> = {
  pending: "Pending approval",
  changes_requested: "Changes requested",
  active: "Active",
  done: "Done",
};

export function planStatus(
  plan: Pick<StoredActionPlan, "approved" | "completed" | "reviewStatus">,
): Exclude<PlanFilters["status"], ""> {
  if (plan.completed) {
    return "done";
  }

  if (plan.approved) {
    return "active";
  }

  return plan.reviewStatus === "changes_requested"
    ? "changes_requested"
    : "pending";
}

export function filterPlans(
  plans: StoredActionPlan[],
  filters: PlanFilters,
): StoredActionPlan[] {
  const owner = filters.owner.trim().toLowerCase();

  return plans.filter(
    (plan) =>
      (!filters.property ||
        plan.sustainabilityCase.property === filters.property) &&
      (!filters.department ||
        plan.sustainabilityCase.department === filters.department) &&
      (!filters.status || planStatus(plan) === filters.status) &&
      (!owner || plan.owner.toLowerCase().includes(owner)),
  );
}

export function hasActiveFilters(filters: PlanFilters) {
  return Object.values(filters).some((value) => value !== "");
}

/** Reads filters from a query string, ignoring anything unrecognised. */
export function parseFilters(
  params: { get(name: string): string | null } | null,
): PlanFilters {
  const read = (name: string) => (params?.get(name) ?? "").slice(0, 120);
  const status = read("status");

  return {
    property: read("property"),
    department: read("department"),
    status: STATUSES.has(status) ? (status as PlanFilters["status"]) : "",
    owner: read("owner"),
  };
}

/** Query string for the filters (without the leading "?"). */
export function filtersToQuery(filters: PlanFilters): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  return params.toString();
}

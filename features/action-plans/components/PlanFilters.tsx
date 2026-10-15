import { useMemo } from "react";
import type { StoredActionPlan } from "@/lib/types";
import {
  EMPTY_FILTERS,
  STATUS_LABELS,
  hasActiveFilters,
  type PlanFilters,
} from "../domain/filters";

const selectClassName =
  "min-h-10 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

export function PlanFiltersBar({
  plans,
  filters,
  shown,
  onChange,
}: {
  plans: StoredActionPlan[];
  filters: PlanFilters;
  shown: number;
  onChange: (filters: PlanFilters) => void;
}) {
  const properties = useMemo(
    () =>
      [
        ...new Set(plans.map((plan) => plan.sustainabilityCase.property)),
      ].sort(),
    [plans],
  );
  const departments = useMemo(
    () =>
      [
        ...new Set(plans.map((plan) => plan.sustainabilityCase.department)),
      ].sort(),
    [plans],
  );
  const active = hasActiveFilters(filters);

  function update(patch: Partial<PlanFilters>) {
    onChange({ ...filters, ...patch });
  }

  return (
    <section
      aria-label="Filter plans"
      className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          Property
          <select
            className={`${selectClassName} mt-1 font-normal normal-case tracking-normal`}
            value={filters.property}
            onChange={(event) => update({ property: event.target.value })}
          >
            <option value="">All properties</option>
            {properties.map((property) => (
              <option key={property} value={property}>
                {property}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          Department
          <select
            className={`${selectClassName} mt-1 font-normal normal-case tracking-normal`}
            value={filters.department}
            onChange={(event) => update({ department: event.target.value })}
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          Status
          <select
            className={`${selectClassName} mt-1 font-normal normal-case tracking-normal`}
            value={filters.status}
            onChange={(event) =>
              update({ status: event.target.value as PlanFilters["status"] })
            }
          >
            <option value="">Any status</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          Owner
          <input
            className={`${selectClassName} mt-1 font-normal normal-case tracking-normal`}
            type="search"
            value={filters.owner}
            placeholder="Name contains…"
            onChange={(event) => update({ owner: event.target.value })}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-stone-600">
        <span>
          Showing {shown} of {plans.length}
        </span>
        {active ? (
          <button
            className="font-semibold text-emerald-800 underline-offset-4 hover:underline"
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </section>
  );
}

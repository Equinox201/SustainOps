import type { StoredActionPlan } from "@/lib/types";
import { getOperationalOverviewMetrics } from "../domain/plan-utils";

export function OperationalOverview({ plans }: { plans: StoredActionPlan[] }) {
  const { metrics, departments } = getOperationalOverviewMetrics(plans);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
            Operational Overview
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950">
            Implementation Progress
          </h2>
        </div>
        {departments.length > 0 ? (
          <p className="max-w-2xl text-sm leading-6 text-stone-600">
            Departments represented: {departments.join(", ")}
          </p>
        ) : null}
      </div>

      {plans.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm leading-6 text-stone-600">
          Load demo cases or create a new plan to see operational progress.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {metrics.map((metric) => (
            <article
              key={metric.label}
              className="rounded-lg border border-stone-200 bg-[#fbfaf7] p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-stone-500">
                {metric.label}
              </p>
              <p className="mt-3 text-3xl font-semibold text-stone-950">
                {metric.value}
              </p>
              <p className="mt-2 text-sm leading-5 text-stone-600">
                {metric.helperText}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

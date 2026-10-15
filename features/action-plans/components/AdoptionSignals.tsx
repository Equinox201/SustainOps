import type { AuditEvent, StoredActionPlan } from "@/lib/types";
import { getAdoptionSignals } from "../domain/adoption-signals";

export function AdoptionSignals({
  plans,
  auditEvents,
  isLoading,
}: {
  plans: StoredActionPlan[];
  auditEvents: AuditEvent[];
  isLoading: boolean;
}) {
  const { metrics, departments } = getAdoptionSignals(plans, auditEvents);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
            Adoption Signals
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950">
            Workflow Usage
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Usage signals from the server-side audit log showing how teams use
            the workflow.
          </p>
        </div>
        {departments.length > 0 ? (
          <p className="max-w-2xl text-sm leading-6 text-stone-600">
            Most active departments: {departments.join(", ")}
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-dashed border-stone-300 px-4 py-4 text-sm text-stone-600"
        >
          Loading usage signals…
        </p>
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

      <p className="mt-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
        Signals are computed from the server-side audit log.
      </p>
    </section>
  );
}

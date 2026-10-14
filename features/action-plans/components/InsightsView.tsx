import type { StoredActionPlan, TelemetryEvent } from "@/lib/types";
import { AdoptionSignals } from "./AdoptionSignals";
import { KnowledgeSourcesPanel } from "./KnowledgeSourcesPanel";

export function InsightsView({
  plans,
  telemetryEvents,
}: {
  plans: StoredActionPlan[];
  telemetryEvents: TelemetryEvent[];
}) {
  const hasNoSignals = plans.length === 0 && telemetryEvents.length === 0;

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Local Intelligence
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal text-stone-950">
          Insights & Knowledge
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600 sm:text-base">
          Monitor adoption signals and preview the approved sustainability
          knowledge sources that will ground future recommendations.
        </p>
      </div>

      {hasNoSignals ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white px-5 py-5 text-sm leading-6 text-stone-600 shadow-sm">
          Load demo cases or create action plans to see adoption signals.
        </div>
      ) : null}

      <AdoptionSignals plans={plans} telemetryEvents={telemetryEvents} />
      <KnowledgeSourcesPanel />
    </section>
  );
}

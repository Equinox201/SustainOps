import type { AuditEvent, StoredActionPlan } from "@/lib/types";
import { useKnowledgeDocuments } from "../hooks/useKnowledgeDocuments";
import { AdoptionSignals } from "./AdoptionSignals";
import { KnowledgeSourcesPanel } from "./KnowledgeSourcesPanel";

export function InsightsView({
  plans,
  auditEvents,
}: {
  plans: StoredActionPlan[];
  auditEvents: AuditEvent[];
}) {
  const { documents, error } = useKnowledgeDocuments(true);
  const hasNoSignals = plans.length === 0 && auditEvents.length === 0;

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Insights
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal text-stone-950">
          Insights & Knowledge
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600 sm:text-base">
          Monitor adoption signals and see the approved sustainability
          knowledge sources that ground every recommendation.
        </p>
      </div>

      {hasNoSignals ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white px-5 py-5 text-sm leading-6 text-stone-600 shadow-sm">
          Load demo cases or create action plans to see adoption signals.
        </div>
      ) : null}

      <AdoptionSignals plans={plans} auditEvents={auditEvents} />
      <KnowledgeSourcesPanel documents={documents} error={error} />
    </section>
  );
}

import { approvedKnowledgeSources } from "../constants";

export function KnowledgeSourcesPanel() {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Approved Knowledge Sources
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950">
          Future Grounding Layer
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-stone-600">
          In production, AI recommendations would be grounded in approved company
          policies, SOPs, and reporting guidance.
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {approvedKnowledgeSources.map((source) => (
          <article
            key={source.title}
            className="rounded-lg border border-stone-200 bg-[#fbfaf7] p-4"
          >
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">
                {source.type}
              </span>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900">
                {source.status}
              </span>
            </div>
            <h3 className="mt-4 text-base font-semibold leading-6 text-stone-950">
              {source.title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              {source.use}
            </p>
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-950">
              Mock source — not used for live generation yet
            </p>
          </article>
        ))}
      </div>

      <p className="mt-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
        Future version: connect approved policies, SOPs, and reporting guidance
        through RAG so generated action plans can cite trusted internal sources.
      </p>
    </section>
  );
}

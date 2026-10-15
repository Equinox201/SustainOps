import type { KnowledgeDocumentInfo } from "../types";

const STATUS_STYLES: Record<string, string> = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-900",
  draft: "border-amber-200 bg-amber-50 text-amber-950",
  superseded: "border-stone-200 bg-stone-100 text-stone-600",
};

export function KnowledgeSourcesPanel({
  documents,
  error,
}: {
  documents: KnowledgeDocumentInfo[];
  error: string | null;
}) {
  const approved = documents.filter((document) => document.status === "approved");
  const sections = approved.reduce((sum, document) => sum + document.chunkCount, 0);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Approved Knowledge Sources
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950">
          What plans are grounded in
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-stone-600">
          Recommendations are generated from these documents and cite the exact
          section they rely on. Only approved documents are ever retrieved;
          superseded versions are kept for the record. All documents are
          synthetic, created for demonstration.
        </p>
        {documents.length > 0 ? (
          <p className="mt-2 text-sm font-medium text-stone-800">
            {approved.length} approved documents · {sections} citeable sections
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-rose-900">{error}</p>
      ) : null}

      {documents.length === 0 && !error ? (
        <p className="mt-5 rounded-lg border border-dashed border-stone-300 px-4 py-4 text-sm text-stone-600">
          No documents ingested yet. Run <code>npm run knowledge:ingest</code>.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {documents.map((document) => (
          <article
            key={document.id}
            className="rounded-lg border border-stone-200 bg-[#fbfaf7] p-4"
          >
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">
                {document.documentType}
              </span>
              <span
                className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                  STATUS_STYLES[document.status] ?? STATUS_STYLES.draft
                }`}
              >
                {document.status}
              </span>
            </div>
            <h3 className="mt-4 text-base font-semibold leading-6 text-stone-950">
              {document.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {document.department} · v{document.version} ·{" "}
              {document.region.toUpperCase()} · {document.chunkCount} sections
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

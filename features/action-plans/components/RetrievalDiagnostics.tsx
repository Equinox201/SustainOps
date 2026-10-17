import { useState } from "react";
import type { RetrievalDecision } from "@/lib/types";
import { useRetrievalDiagnostics } from "../hooks/useRetrievalDiagnostics";
import { formatDate } from "../domain/plan-utils";

const DECISION_LABELS: Record<RetrievalDecision, string> = {
  kept: "Given to the model",
  below_floor: "Below the similarity floor",
  beyond_top_k: "Ranked below the cut-off",
  excluded_department: "Another department's document",
  excluded_status: "Not an approved document",
  excluded_model: "Embedded with a different model",
};

const DECISION_STYLES: Record<RetrievalDecision, string> = {
  kept: "border-emerald-200 bg-emerald-50 text-emerald-900",
  below_floor: "border-amber-200 bg-amber-50 text-amber-900",
  beyond_top_k: "border-stone-200 bg-stone-100 text-stone-700",
  excluded_department: "border-stone-200 bg-white text-stone-500",
  excluded_status: "border-stone-200 bg-white text-stone-500",
  excluded_model: "border-stone-200 bg-white text-stone-500",
};

/**
 * Why each section of the knowledge base was or was not shown to the model
 * when this plan was generated. For managers and reviewers.
 */
export function RetrievalDiagnostics({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const { loaded, error, isLoading } = useRetrievalDiagnostics(planId, open);

  const counts = new Map<RetrievalDecision, number>();

  for (const candidate of loaded?.diagnostics.candidates ?? []) {
    counts.set(candidate.decision, (counts.get(candidate.decision) ?? 0) + 1);
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.13em] text-stone-700">
        Retrieval record
      </h3>
      <p className="mt-2 text-sm leading-6 text-stone-500">
        Every section of the knowledge base that was considered, and why it was
        or was not given to the model.
      </p>

      {!open ? (
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline"
          onClick={() => setOpen(true)}
        >
          Show retrieval record
        </button>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rose-900">{error}</p> : null}
      {isLoading ? (
        <p role="status" className="mt-3 text-sm text-stone-500">
          Loading retrieval record…
        </p>
      ) : null}

      {loaded ? (
        <div className="mt-4">
          <p className="text-sm leading-6 text-stone-600">
            Generated {formatDate(loaded.generation.createdAt)} with{" "}
            {loaded.generation.model}. Embeddings:{" "}
            {loaded.diagnostics.embeddingModel}. Top {loaded.diagnostics.topK},
            similarity floor {loaded.diagnostics.minScore}. Policy requirements
            verified: {loaded.generation.policyClaimsVerified} of{" "}
            {loaded.generation.policyClaims} claimed.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {[...counts.entries()].map(([decision, n]) => (
              <li
                key={decision}
                className={`rounded-md border px-2 py-0.5 font-semibold ${DECISION_STYLES[decision]}`}
              >
                {DECISION_LABELS[decision]}: {n}
              </li>
            ))}
          </ul>
          <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-stone-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-stone-50 text-xs uppercase tracking-[0.1em] text-stone-500">
                <tr>
                  <th className="px-3 py-2">Section</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Decision</th>
                </tr>
              </thead>
              <tbody>
                {loaded.diagnostics.candidates.map((candidate) => (
                  <tr
                    key={candidate.chunkId}
                    className="border-t border-stone-100"
                  >
                    <td className="px-3 py-2 text-stone-800">
                      {candidate.documentTitle} v{candidate.documentVersion}{" "}
                      {candidate.sectionRef}
                      <span className="block text-xs text-stone-500">
                        {candidate.heading}
                        {candidate.documentStatus !== "approved"
                          ? ` · ${candidate.documentStatus}`
                          : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {candidate.department}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-stone-600">
                      {candidate.score === null
                        ? "n/a"
                        : candidate.score.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${DECISION_STYLES[candidate.decision]}`}
                      >
                        {DECISION_LABELS[candidate.decision]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

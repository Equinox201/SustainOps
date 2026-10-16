import type { AIActionPlan, SourceRef, StoredAction } from "@/lib/types";
import { checkQuote, DOWNGRADE_LABELS } from "@/lib/provenance";
import { sourceLabel } from "./SourceChips";

const GROUP_WIDE = "All departments";

function applicability(source: SourceRef, department: string) {
  if (source.department === department) {
    return `Same department (${department})`;
  }

  return source.department === GROUP_WIDE
    ? "Group-wide document"
    : `Other department (${source.department})`;
}

/** The source's text with the verified quotation picked out. */
function Excerpt({ source, quote }: { source: SourceRef; quote?: string }) {
  const found = quote ? checkQuote(quote, source.excerpt) : null;

  if (!found?.ok) {
    return (
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">
        {source.excerpt}
      </p>
    );
  }

  return (
    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">
      {source.excerpt.slice(0, found.start)}
      <mark className="rounded bg-emerald-200 px-0.5 text-emerald-950">
        {source.excerpt.slice(found.start, found.end)}
      </mark>
      {source.excerpt.slice(found.end)}
    </p>
  );
}

/**
 * The proof behind an action: the sources it cites, where each came from and
 * whether it applies here, and, for a policy requirement, the exact words the
 * server found in the source.
 */
export function EvidencePanel({
  action,
  actionPlan,
  department,
}: {
  action: StoredAction;
  actionPlan: AIActionPlan;
  department: string;
}) {
  const cited = action.sourceIds
    .map((id) => actionPlan.sources.find((source) => source.id === id))
    .filter((source): source is SourceRef => Boolean(source));

  if (cited.length === 0 && !action.downgradeReason) {
    return null;
  }

  return (
    <details className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-stone-800">
        Evidence
        {cited.length > 0
          ? ` (${cited.length} source${cited.length === 1 ? "" : "s"})`
          : ""}
      </summary>

      {action.downgradeReason ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
          {DOWNGRADE_LABELS[action.downgradeReason]}
        </p>
      ) : null}

      {action.claimType === "policy_requirement" && action.evidence ? (
        <p className="mt-3 text-sm leading-6 text-stone-700">
          <span className="font-semibold">Quoted from the source: </span>“
          {action.evidence.quote}”
        </p>
      ) : cited.length > 0 ? (
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {action.claimType === "assumption"
            ? "These sources are context only; the action rests on an assumption."
            : "These sources are supporting context. Nothing in them was verified as requiring this action."}
        </p>
      ) : null}

      <ul className="mt-3 space-y-3">
        {cited.map((source) => (
          <li
            key={source.id}
            className="rounded-lg border border-stone-200 bg-white px-4 py-3"
          >
            <p className="text-sm font-semibold text-stone-900">
              {sourceLabel(source)} · {source.heading}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-stone-500">
              {applicability(source, department)} · approved when retrieved ·{" "}
              {source.score === 1
                ? "curated for the demo"
                : `relevance ${source.score.toFixed(2)}`}
            </p>
            <Excerpt
              source={source}
              quote={
                action.evidence?.sourceId === source.id
                  ? action.evidence.quote
                  : undefined
              }
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

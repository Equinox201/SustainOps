import type { SourceRef } from "@/lib/types";

export function sourceLabel(source: SourceRef) {
  return `${source.documentTitle} v${source.documentVersion} ${source.sectionRef}`;
}

/** The sources an action cites, or a plain note that it cites none. */
export function SourceChips({
  sourceIds,
  sources,
}: {
  sourceIds: string[];
  sources: SourceRef[];
}) {
  if (sourceIds.length === 0) {
    return (
      <span className="mt-2 inline-flex rounded-md border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
        No approved source
      </span>
    );
  }

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Sources">
      {sourceIds.map((id) => {
        const source = sources.find((candidate) => candidate.id === id);

        return source ? (
          <li
            key={id}
            title={source.heading}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900"
          >
            {sourceLabel(source)}
          </li>
        ) : null;
      })}
    </ul>
  );
}

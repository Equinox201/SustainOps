import { getVisibleStatus } from "../domain/plan-utils";
import type { EditorDraft } from "../types";
import { StatusBadge } from "./StatusBadge";

export function PlanStateBadges({ draft }: { draft: EditorDraft }) {
  return (
    <>
      <StatusBadge status={getVisibleStatus(draft)} />
      <span className="inline-flex rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
        {draft.actionPlan ? "Generated" : "Draft"}
      </span>
    </>
  );
}

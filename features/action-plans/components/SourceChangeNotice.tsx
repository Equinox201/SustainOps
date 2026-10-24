import type { SourceAlert } from "@/lib/types";

/**
 * Shown on a plan whose cited documents have changed since it was generated.
 * The plan is not altered: reassessing means regenerating it, which records a
 * new version and leaves this one in the history.
 */
export function SourceChangeNotice({
  alerts,
  approved,
}: {
  alerts: SourceAlert[];
  approved: boolean;
}) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <div role="status" className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
      <p className="font-semibold">Knowledge this plan relied on has changed</p>
      <ul className="mt-1 list-disc pl-5">
        {alerts.map((alert) => (
          <li key={alert.documentId}>
            {alert.documentTitle} v{alert.citedVersion} was{" "}
            {alert.status === "withdrawn" ? "withdrawn" : "superseded"}
            {alert.currentVersion
              ? `; v${alert.currentVersion} now applies.`
              : "; nothing replaces it yet."}
          </li>
        ))}
      </ul>
      <p className="mt-1">
        This plan still shows the sections it was generated from.{" "}
        {approved
          ? "Reset approval and regenerate it to reassess; the current version stays in its history."
          : "Regenerate it to reassess against the current documents."}
      </p>
    </div>
  );
}

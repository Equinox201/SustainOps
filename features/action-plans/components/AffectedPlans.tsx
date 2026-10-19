import type { StoredActionPlan } from "@/lib/types";
import { planPath } from "../domain/routes";

/**
 * Plans built on documents that have since been superseded or withdrawn. They
 * keep the sections they were generated from, so nothing is rewritten; this
 * tells people which ones to reassess.
 */
export function AffectedPlans({ plans }: { plans: StoredActionPlan[] }) {
  const affected = plans.filter((plan) => plan.sourceAlerts.length > 0);

  if (affected.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-5 sm:p-6" aria-label="Plans affected by knowledge changes">
      <h2 className="text-lg font-semibold text-amber-950">
        {affected.length} plan{affected.length === 1 ? "" : "s"} built on knowledge that changed
      </h2>
      <ul className="mt-3 space-y-3 text-sm leading-6 text-amber-950">
        {affected.map((plan) => (
          <li key={plan.id}>
            <a className="font-semibold underline underline-offset-4" href={planPath(plan.id)}>
              {plan.title}
            </a>
            <ul className="mt-1 list-disc pl-5">
              {plan.sourceAlerts.map((alert) => (
                <li key={alert.documentId}>
                  {alert.documentTitle} v{alert.citedVersion} was{" "}
                  {alert.status === "withdrawn" ? "withdrawn" : "superseded"}
                  {alert.currentVersion
                    ? `; v${alert.currentVersion} now applies`
                    : "; nothing replaces it yet"}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

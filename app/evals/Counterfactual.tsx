import fs from "node:fs";
import path from "node:path";
import type {
  CounterfactualCondition,
  CounterfactualReport,
  Decision,
} from "@/lib/evals/counterfactual";

const DECISION_LABELS: Record<Decision | "failed", string> = {
  consolidate_now: "Consolidate now",
  hold_off: "Hold off",
  no_clear_decision: "No clear decision",
  failed: "Run failed",
};

const DECISION_STYLES: Record<Decision | "failed", string> = {
  consolidate_now: "border-emerald-200 bg-emerald-50 text-emerald-900",
  hold_off: "border-amber-200 bg-amber-50 text-amber-950",
  no_clear_decision: "border-stone-200 bg-stone-100 text-stone-700",
  failed: "border-rose-200 bg-rose-50 text-rose-900",
};

/** Read at build time; the section is simply absent until a run is published. */
function load(): CounterfactualReport | null {
  const file = path.join(process.cwd(), "evals", "results", "counterfactual.json");

  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CounterfactualReport;
  } catch {
    return null;
  }
}

function tally(condition: CounterfactualCondition) {
  const counts = new Map<Decision | "failed", number>();

  for (const run of condition.runs) {
    const key = run.ok ? (run.decision ?? "no_clear_decision") : "failed";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()];
}

function unique(values: string[][]) {
  return [...new Set(values.flat())];
}

export function Counterfactual() {
  const report = load();

  if (!report) {
    return null;
  }

  const { conditions } = report;

  return (
    <section aria-label="Does retrieval change the decision">
      <h2 className="text-xl font-semibold text-stone-950">
        Does retrieval change the decision?
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        One case, generated three times under three versions of the company
        policy, with nothing else changed. If the plans only reworded
        themselves, retrieval would be decoration. The case: forecast occupancy
        is 38 percent for four nights, and Engineering asks whether to
        consolidate floors now. Run {new Date(report.meta.generatedAt).toISOString().slice(0, 10)} ·{" "}
        {report.meta.generationModel} · prompt {report.meta.promptVersion} ·{" "}
        {report.meta.runsPerCondition} runs per condition
        {report.meta.gitSha ? ` · commit ${report.meta.gitSha}` : ""}.
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        The policy change is one sentence in {report.change.document}:{" "}
        <em>{report.change.before}</em> became <em>{report.change.after}</em>.
        It went through the same draft, review and publish steps a user would
        take.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-[0.12em] text-stone-500">
            <tr>
              <th className="px-4 py-3">Policy in force</th>
              <th className="px-4 py-3">Decision the plan recommends</th>
              <th className="px-4 py-3">Figures in verified quotations</th>
              <th className="px-4 py-3">Documents cited</th>
            </tr>
          </thead>
          <tbody>
            {conditions.map((condition) => {
              const figures = unique(condition.runs.map((r) => r.figuresInVerifiedQuotes));
              const documents = unique(
                condition.runs.map((r) => r.citedDocuments.filter((d) => d.includes("Energy"))),
              );

              return (
                <tr key={condition.id} className="border-t border-stone-100 align-top">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-stone-900">{condition.label}</span>
                    <span className="block text-xs text-stone-500">{condition.description}</span>
                  </td>
                  <td className="px-4 py-3">
                    <ul className="flex flex-wrap gap-2">
                      {tally(condition).map(([decision, n]) => (
                        <li
                          key={decision}
                          className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${DECISION_STYLES[decision]}`}
                        >
                          {DECISION_LABELS[decision]}: {n} of {condition.runs.length}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3 text-stone-800">
                    {figures.length > 0 ? figures.join(", ") : "none (nothing to quote)"}
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {documents.length > 0 ? documents.join("; ") : "no Energy policy"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-stone-800">
          A verified quotation and a recommended action from each condition
        </summary>
        <ul className="mt-3 space-y-3 text-sm leading-6 text-stone-700">
          {conditions.map((condition) => {
            const run = condition.runs.find((r) => r.ok);

            return (
              <li key={condition.id}>
                <span className="font-semibold">{condition.label}</span>
                {run?.verifiedQuotes[0] ? (
                  <span className="block">Quoted: “{run.verifiedQuotes[0]}”</span>
                ) : null}
                {run?.actions[0] ? (
                  <span className="block">Action: {run.actions[0]}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </details>

      <h3 className="mt-5 text-sm font-semibold uppercase tracking-[0.13em] text-stone-700">
        How far to trust this
      </h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-stone-600">
        {report.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
    </section>
  );
}

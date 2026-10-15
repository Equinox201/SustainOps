import type { Metadata } from "next";
import Link from "next/link";
import latest from "@/evals/results/latest.json";
import { CATEGORY_LABELS } from "@/lib/evals/categories";
import type { EvalReport } from "@/lib/evals/report";
import type { Proportion } from "@/lib/evals/types";

export const metadata: Metadata = {
  title: "Evaluation results — SustainOps",
  description:
    "Measured grounding, citation and safety results for SustainOps, with the benchmark and its limits.",
};

const report = latest as unknown as EvalReport;

function pct(value: number | null, digits = 0) {
  return value === null ? "n/a" : `${(value * 100).toFixed(digits)}%`;
}

function Rate({ value }: { value: Proportion }) {
  const interval = value.interval
    ? `95% CI ${pct(value.interval[0])}–${pct(value.interval[1])}`
    : "no data";

  return (
    <>
      <span className="text-3xl font-semibold text-stone-950">
        {pct(value.rate)}
      </span>
      <span className="mt-1 block text-xs text-stone-500">
        {value.numerator} of {value.denominator} · {interval}
      </span>
    </>
  );
}

function Metric({
  label,
  hint,
  value,
  tone = "neutral",
}: {
  label: string;
  hint: string;
  value: Proportion;
  tone?: "neutral" | "wantZero";
}) {
  const bad = tone === "wantZero" && value.numerator > 0;

  return (
    <div
      className={`rounded-lg border p-5 ${
        bad ? "border-rose-300 bg-rose-50" : "border-stone-200 bg-white"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-stone-500">
        {label}
      </p>
      <p className="mt-2">
        <Rate value={value} />
      </p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{hint}</p>
    </div>
  );
}

export default function EvalsPage() {
  const { meta, summary } = report;
  const retrieval = summary.retrieval;
  const generation = summary.generation;
  const failing = report.cases.filter((item) => item.failures.length > 0);

  return (
    <main className="min-h-screen bg-[#f7f3ec] text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:py-12">
        <header>
          <Link
            href="/"
            className="text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline"
          >
            ← Back to SustainOps
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
            Evaluation
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-950 sm:text-4xl">
            Is it actually grounded?
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-600">
            {summary.cases} labelled cases run through the same retrieval and
            generation code the app uses. These numbers are published as
            measured, including the cases that fail.
          </p>
          <p className="mt-3 text-sm text-stone-500">
            Run {new Date(meta.generatedAt).toISOString().slice(0, 10)} ·{" "}
            {meta.mode === "full" ? `${meta.generationModel} · ` : ""}
            embeddings {meta.embedder} · prompt {meta.promptVersion ?? "n/a"} ·
            top-{meta.topK}, similarity floor {meta.minScore}
            {meta.gitSha ? ` · commit ${meta.gitSha}` : ""}
          </p>
        </header>

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-stone-950">
            Result: {summary.passed} of {summary.cases} cases passed every hard
            check
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-stone-500">
                <tr>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Passed</th>
                </tr>
              </thead>
              <tbody>
                {report.byCategory.map((row) => (
                  <tr key={row.category} className="border-t border-stone-100">
                    <td className="py-2 pr-4">{CATEGORY_LABELS[row.category]}</td>
                    <td className="py-2 pr-4 font-medium">
                      {row.passed} / {row.cases}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-950">Retrieval</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric
              label="Gold hit rate"
              hint="Cases where at least one section a human would cite was retrieved."
              value={retrieval.goldHitRate}
            />
            <Metric
              label="Gold section recall"
              hint="Share of all gold sections that were retrieved."
              value={retrieval.goldSectionRecall}
            />
            <Metric
              label="Forbidden-document leakage"
              hint="Cases that retrieved a superseded or wrong-department document. Must be zero."
              value={retrieval.forbiddenLeakage}
              tone="wantZero"
            />
            <Metric
              label="Abstention"
              hint="Off-topic cases that correctly retrieved nothing."
              value={retrieval.abstention}
            />
            <Metric
              label="Coverage"
              hint="Cases with an applicable document that retrieved something."
              value={retrieval.coverage}
            />
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-stone-500">
                Document precision
              </p>
              <p className="mt-2 text-3xl font-semibold text-stone-950">
                {pct(retrieval.documentPrecision)}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Share of retrieved sections that come from a document holding a
                gold section (mean over cases).
              </p>
            </div>
          </div>
        </section>

        {generation ? (
          <section>
            <h2 className="text-xl font-semibold text-stone-950">Generation</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Metric
                label="Completed"
                hint="Generations that produced a valid plan."
                value={generation.completion}
              />
              <Metric
                label="Valid on the first attempt"
                hint="Strict-schema output needed no retry."
                value={generation.firstAttemptCompliance}
              />
              <Metric
                label="Grounding as expected"
                hint="Plans labelled grounded when sources exist, and ungrounded when they do not."
                value={generation.groundingAsExpected}
              />
              <Metric
                label="Citation coverage"
                hint="Recommended actions that cite at least one retrieved source (cases that retrieved sources)."
                value={generation.citationCoverage}
              />
              <Metric
                label="Invalid citations"
                hint="Citations to sources the model was never given; the server drops these."
                value={generation.invalidCitationRate}
                tone="wantZero"
              />
              <Metric
                label="Untraceable figures"
                hint="Percentages and temperatures in the plan that appear in neither the case nor the retrieved sources."
                value={generation.untraceableFigureRate}
                tone="wantZero"
              />
              {generation.faithfulness ? (
                <>
                  <Metric
                    label="Judged faithful"
                    hint={`Cited actions an LLM judge rated fully supported by their excerpts (${generation.faithfulness.actionsJudged} judged).`}
                    value={generation.faithfulness.supported}
                  />
                  <Metric
                    label="Supported or partly supported"
                    hint="Same judgement, counting partially supported actions."
                    value={generation.faithfulness.supportedOrPartial}
                  />
                </>
              ) : null}
              <Metric
                label="KPIs measurable"
                hint="KPIs that name a number, a rate or a unit (heuristic)."
                value={generation.kpiMeasurable}
              />
              <Metric
                label="Stale figure stated"
                hint="Trap cases where the plan repeated the superseded SOP's figure. Must be zero."
                value={generation.staleFactCases}
                tone="wantZero"
              />
              <Metric
                label="Forbidden text echoed"
                hint="Adversarial cases where injected text or guest identifiers appeared in the plan. Must be zero."
                value={generation.forbiddenTextCases}
                tone="wantZero"
              />
              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-stone-500">
                  Latency
                </p>
                <p className="mt-2 text-3xl font-semibold text-stone-950">
                  {((generation.latencyMs.p50 ?? 0) / 1000).toFixed(1)}s
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  median · p95 {((generation.latencyMs.p95 ?? 0) / 1000).toFixed(1)}s ·
                  mean output {Math.round(generation.outputTokensMean ?? 0)} tokens
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-amber-950">
            How far to trust this
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-950">
            {report.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>

        {failing.length > 0 ? (
          <section>
            <h2 className="text-xl font-semibold text-stone-950">
              Cases that failed
            </h2>
            <ul className="mt-4 space-y-3">
              {failing.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-rose-200 bg-white p-4"
                >
                  <p className="text-sm font-semibold text-stone-950">
                    {item.title}{" "}
                    <span className="font-normal text-stone-500">
                      ({item.id})
                    </span>
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-900">
                    {item.failures.map((failure) => (
                      <li key={failure}>{failure}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 className="text-xl font-semibold text-stone-950">All cases</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-[0.12em] text-stone-500">
                <tr>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Gold found</th>
                  <th className="px-4 py-3">Retrieved</th>
                  {generation ? <th className="px-4 py-3">Plan</th> : null}
                  <th className="px-4 py-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {report.cases.map((item) => {
                  const goldTotal =
                    item.retrieval.goldFound.length + item.retrieval.goldMissed.length;

                  return (
                    <tr key={item.id} className="border-t border-stone-100 align-top">
                      <td className="px-4 py-3">
                        <span className="font-medium text-stone-950">{item.title}</span>
                        <span className="block text-xs text-stone-500">{item.id}</span>
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {CATEGORY_LABELS[item.category]}
                      </td>
                      <td className="px-4 py-3">
                        {goldTotal === 0
                          ? "—"
                          : `${item.retrieval.goldFound.length} / ${goldTotal}`}
                      </td>
                      <td className="px-4 py-3">{item.retrieval.retrieved.length}</td>
                      {generation ? (
                        <td className="px-4 py-3 text-stone-600">
                          {item.generation?.ok
                            ? `${item.generation.groundingStatus} · ${item.generation.confidence} · ${item.generation.actionsCited}/${item.generation.actions} cited`
                            : "failed"}
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            item.failures.length === 0
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border-rose-200 bg-rose-50 text-rose-900"
                          }`}
                        >
                          {item.failures.length === 0 ? "pass" : "fail"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="text-sm leading-6 text-stone-600">
          <h2 className="text-lg font-semibold text-stone-950">Reproduce</h2>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-white p-4 text-xs leading-6 text-stone-800">
{`npm run evals -- --mode retrieval --embedder hash        # free, offline
npm run evals -- --mode retrieval --embedder openai      # embeddings only
npm run evals -- --mode full --embedder openai --judge   # full pipeline`}
          </pre>
          <p className="mt-3">
            The benchmark lives in <code>evals/cases.ts</code>; methodology and
            metric definitions are in <code>evals/README.md</code>.
          </p>
        </section>
      </div>
    </main>
  );
}

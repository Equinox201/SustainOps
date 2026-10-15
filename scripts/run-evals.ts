// Runs the benchmark and writes a JSON report.
//
//   npm run evals -- --mode retrieval --embedder hash        free, offline
//   npm run evals -- --mode retrieval --embedder openai      embeddings only
//   npm run evals -- --mode full --embedder openai --judge   full pipeline
//
// Options: --concurrency N (default 3), --limit N, --publish (also write
// evals/results/latest.json, which the /evals page displays).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { evalCases } from "../evals/cases";
import { runGenerationEval } from "../lib/evals/generation-eval";
import { buildEvalWorld, runRetrievalEval } from "../lib/evals/harness";
import { CATEGORY_LABELS } from "../lib/evals/categories";
import { buildReport, type EvalReport } from "../lib/evals/report";
import { PROMPT_VERSION } from "../lib/prompts";
import { defaultMinScore, getEmbedder } from "../lib/server/embeddings";
import { getEnv, type ServerEnv } from "../lib/server/env";

loadEnvConfig(process.cwd());

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));

  if (found) {
    return found.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  const next = process.argv[index + 1];

  return index >= 0 && next && !next.startsWith("--") ? next : undefined;
}

const flag = (name: string) => process.argv.includes(`--${name}`);
const pct = (value: number | null) =>
  value === null ? "  n/a" : `${(value * 100).toFixed(0).padStart(4)}%`;
const frac = (p: { numerator: number; denominator: number }) =>
  `${p.numerator}/${p.denominator}`;

async function main() {
  const mode = (arg("mode") ?? "retrieval") as "retrieval" | "full";
  const embedderName = (arg("embedder") ?? "hash") as "hash" | "openai";
  const concurrency = Number(arg("concurrency") ?? 3);
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const withJudge = flag("judge");
  const baseEnv = getEnv();
  const env: ServerEnv = {
    ...baseEnv,
    EMBEDDINGS_PROVIDER: embedderName,
    // Evals must never trip the demo's abuse limits.
    GENERATION_LIMIT_PER_HOUR: 100_000,
    GENERATION_DAILY_CAP: 100_000,
  };

  if ((mode === "full" || embedderName === "openai") && !env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for this run.");
  }

  const cases = evalCases.slice(0, limit);
  const embedder = getEmbedder(env);
  const minScore = env.RETRIEVAL_MIN_SCORE ?? defaultMinScore(embedder);
  const topK = env.RETRIEVAL_TOP_K;

  console.log(
    `SustainOps evals  mode=${mode}  embedder=${embedder.model}  cases=${cases.length}  topK=${topK}  floor=${minScore}`,
  );

  const world = await buildEvalWorld(embedder);
  console.log(
    `Corpus: ${world.corpus.documents} documents (${world.corpus.approvedDocuments} approved), ${world.corpus.sections} sections`,
  );

  const retrieval = await runRetrievalEval(world, cases, { topK, minScore });
  let generation;

  if (mode === "full") {
    console.log(
      `Generating with ${env.OPENAI_MODEL}${withJudge ? " + faithfulness judge" : ""} ...`,
    );
    generation = await runGenerationEval({
      world,
      env,
      cases,
      concurrency,
      judge: withJudge ? { model: env.OPENAI_MODEL } : undefined,
      onProgress: (done, total, id) =>
        console.log(`  [${done}/${total}] ${id}`),
    });
  }

  let gitSha: string | null = null;

  try {
    gitSha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    // Uncommitted changes mean the SHA alone would misdescribe what ran.
    const dirty = execSync("git status --porcelain -- . ':!evals/results'", {
      encoding: "utf8",
    }).trim();

    if (dirty) {
      gitSha += "-dirty";
    }
  } catch {
    // Not a git checkout.
  }

  const report: EvalReport = buildReport({
    meta: {
      generatedAt: new Date().toISOString(),
      mode,
      embedder: embedder.model,
      generationModel: mode === "full" ? env.OPENAI_MODEL : null,
      judgeModel: mode === "full" && withJudge ? env.OPENAI_MODEL : null,
      promptVersion: mode === "full" ? PROMPT_VERSION : null,
      topK,
      minScore,
      gitSha,
      corpus: world.corpus,
    },
    cases,
    retrieval,
    generation,
  });

  const directory = path.join(process.cwd(), "evals", "results");
  fs.mkdirSync(directory, { recursive: true });
  const stamp = report.meta.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(directory, `${stamp}-${mode}-${embedder.model}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");

  if (flag("publish")) {
    fs.writeFileSync(
      path.join(directory, "latest.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }

  // ---- console summary ----------------------------------------------------
  const r = report.summary.retrieval;
  console.log(`\nCases passed: ${report.summary.passed}/${report.summary.cases}`);

  for (const entry of report.byCategory) {
    console.log(
      `  ${CATEGORY_LABELS[entry.category].padEnd(24)} ${entry.passed}/${entry.cases}`,
    );
  }

  console.log("\nRetrieval");
  console.log(`  gold hit rate        ${pct(r.goldHitRate.rate)}  ${frac(r.goldHitRate)}`);
  console.log(`  gold section recall  ${pct(r.goldSectionRecall.rate)}  ${frac(r.goldSectionRecall)}`);
  console.log(`  document precision   ${pct(r.documentPrecision)}`);
  console.log(`  forbidden leakage    ${pct(r.forbiddenLeakage.rate)}  ${frac(r.forbiddenLeakage)}   (want 0)`);
  console.log(`  abstention           ${pct(r.abstention.rate)}  ${frac(r.abstention)}`);

  const g = report.summary.generation;

  if (g) {
    console.log("\nGeneration");
    console.log(`  completed            ${pct(g.completion.rate)}  ${frac(g.completion)}`);
    console.log(`  first-try valid      ${pct(g.firstAttemptCompliance.rate)}  ${frac(g.firstAttemptCompliance)}`);
    console.log(`  grounding as expected${pct(g.groundingAsExpected.rate)}  ${frac(g.groundingAsExpected)}`);
    console.log(`  citation coverage    ${pct(g.citationCoverage.rate)}  ${frac(g.citationCoverage)}`);
    console.log(`  invalid citations    ${pct(g.invalidCitationRate.rate)}  ${frac(g.invalidCitationRate)}`);
    console.log(`  untraceable figures  ${pct(g.untraceableFigureRate.rate)}  ${frac(g.untraceableFigureRate)}`);
    console.log(`  KPIs measurable      ${pct(g.kpiMeasurable.rate)}  ${frac(g.kpiMeasurable)}`);
    console.log(`  stale fact stated    ${frac(g.staleFactCases)}   (want 0)`);
    console.log(`  forbidden text       ${frac(g.forbiddenTextCases)}   (want 0)`);

    if (g.faithfulness) {
      console.log(`  judge: supported     ${pct(g.faithfulness.supported.rate)}  ${frac(g.faithfulness.supported)}`);
    }

    console.log(`  latency p50 / p95    ${Math.round((g.latencyMs.p50 ?? 0) / 100) / 10}s / ${Math.round((g.latencyMs.p95 ?? 0) / 100) / 10}s`);
  }

  const failing = report.cases.filter((c) => c.failures.length > 0);

  if (failing.length > 0) {
    console.log("\nFailures");

    for (const c of failing) {
      console.log(`  ${c.id}`);

      for (const failure of c.failures) {
        console.log(`    - ${failure}`);
      }
    }
  }

  console.log(`\nReport: ${path.relative(process.cwd(), file)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Eval run failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });

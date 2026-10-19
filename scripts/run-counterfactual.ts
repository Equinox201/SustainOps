// Runs one case under three versions of the company policy and records what
// the plan recommends in each.
//
//   npm run evals:counterfactual -- --runs 3 --publish
//
// Options: --runs N (default 3), --publish (also write
// evals/results/counterfactual.json, which the /evals page displays).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  COUNTERFACTUAL_CASE,
  POLICY_CHANGE,
  counterfactualLimitations,
  openAIDecisionClassifier,
  runCounterfactual,
  type CounterfactualReport,
} from "../lib/evals/counterfactual";
import { buildEvalWorld } from "../lib/evals/harness";
import { PROMPT_VERSION } from "../lib/prompts";
import { getEmbedder } from "../lib/server/embeddings";
import { getEnv, type ServerEnv } from "../lib/server/env";

loadEnvConfig(process.cwd());

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const next = process.argv[index + 1];

  return index >= 0 && next && !next.startsWith("--") ? next : undefined;
}

async function main() {
  const runs = Number(arg("runs") ?? 3);
  const env: ServerEnv = {
    ...getEnv(),
    EMBEDDINGS_PROVIDER: "openai",
    GENERATION_LIMIT_PER_HOUR: 100_000,
    GENERATION_IP_LIMIT_PER_HOUR: 100_000,
    GENERATION_DAILY_CAP: 100_000,
  };

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for this run.");
  }

  const embedder = getEmbedder(env);
  console.log(
    `Counterfactual  model=${env.OPENAI_MODEL}  embedder=${embedder.model}  runs/condition=${runs}`,
  );

  const world = await buildEvalWorld(embedder);
  const conditions = await runCounterfactual({
    world,
    env,
    classify: openAIDecisionClassifier(env),
    runs,
    concurrency: 3,
    onProgress: (message) => console.log(`  ${message}`),
  });

  let gitSha: string | null = null;

  try {
    gitSha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain -- . ':!evals/results'", {
      encoding: "utf8",
    }).trim();

    if (dirty) {
      gitSha += "-dirty";
    }
  } catch {
    // Not a git checkout.
  }

  const report: CounterfactualReport = {
    schemaVersion: 1,
    meta: {
      generatedAt: new Date().toISOString(),
      generationModel: env.OPENAI_MODEL,
      judgeModel: env.OPENAI_MODEL,
      embedder: embedder.model,
      promptVersion: PROMPT_VERSION,
      runsPerCondition: runs,
      gitSha,
    },
    case: COUNTERFACTUAL_CASE,
    change: { document: "Energy and HVAC Operations SOP §2.2", ...POLICY_CHANGE },
    conditions,
    limitations: counterfactualLimitations(runs),
  };

  for (const condition of conditions) {
    const decisions: Record<string, number> = {};

    for (const run of condition.runs) {
      const key = run.ok ? (run.decision ?? "unknown") : "failed";
      decisions[key] = (decisions[key] ?? 0) + 1;
    }

    const figures = [...new Set(condition.runs.flatMap((r) => r.figuresInVerifiedQuotes))];

    console.log(`\n${condition.label}`);
    console.log(`  decisions: ${JSON.stringify(decisions)}`);
    console.log(`  figures in verified quotations: ${figures.join(", ") || "none"}`);
    console.log(`  grounding: ${condition.runs.map((r) => r.grounding ?? "failed").join(", ")}`);
  }

  const directory = path.join(process.cwd(), "evals", "results");
  fs.mkdirSync(directory, { recursive: true });
  const stamp = report.meta.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(directory, `${stamp}-counterfactual.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");

  if (process.argv.includes("--publish")) {
    fs.writeFileSync(
      path.join(directory, "counterfactual.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }

  console.log(`\nReport: ${path.relative(process.cwd(), file)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

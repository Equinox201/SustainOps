// Generates ONE benchmark case through the real pipeline and prints
// everything needed to audit an eval verdict: the actions, their citations,
// the cited excerpts, the judge's verdict per action, KPIs, and any figure
// flagged as untraceable.
//
//   npm run evals:inspect -- hk-laundry-baseline
import { loadEnvConfig } from "@next/env";
import { evalCases } from "../evals/cases";
import { buildEvalWorld } from "../lib/evals/harness";
import { judgeFaithfulness } from "../lib/evals/judge";
import {
  extractFigures,
  isMeasurableKpi,
  planText,
  untraceableFigures,
} from "../lib/evals/metrics";
import { getEmbedder } from "../lib/server/embeddings";
import { getEnv } from "../lib/server/env";
import { generateActionPlan } from "../lib/server/generation";

loadEnvConfig(process.cwd());

async function main() {
  const id = process.argv[2];
  const evalCase = evalCases.find((candidate) => candidate.id === id);

  if (!evalCase) {
    throw new Error(
      `Unknown case "${id}". Cases: ${evalCases.map((c) => c.id).join(", ")}`,
    );
  }

  const env = {
    ...getEnv(),
    EMBEDDINGS_PROVIDER: "openai" as const,
    GENERATION_LIMIT_PER_HOUR: 100_000,
    GENERATION_IP_LIMIT_PER_HOUR: 100_000,
    GENERATION_DAILY_CAP: 100_000,
  };
  const embedder = getEmbedder(env);
  const world = await buildEvalWorld(embedder);

  const { actionPlan: plan } = await generateActionPlan({
    db: world.db,
    env,
    input: evalCase.input,
    planId: null,
    actor: {
      id: "usr_maya_chen",
      name: "Maya Chen",
      role: "sustainability_manager",
      department: null,
    },
    clientKey: "inspect",
    requestId: "inspect",
    getEmbedder: () => embedder,
  });

  const items = plan.recommendedOperationalActions
    .filter((item) => item.sourceIds.length > 0)
    .map((item) => ({
      action: item.action,
      ids: item.sourceIds,
      excerpts: item.sourceIds.map(
        (sourceId) => plan.sources.find((s) => s.id === sourceId)?.excerpt ?? "",
      ),
    }));
  const verdicts = await judgeFaithfulness({
    apiKey: env.OPENAI_API_KEY!,
    baseURL: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
    items: items.map(({ action, excerpts }) => ({ action, excerpts })),
  });

  console.log(`\n=== ${evalCase.id}: ${evalCase.title}`);
  console.log(`grounding=${plan.grounding.status} confidence=${plan.confidenceLevel}\n`);

  items.forEach((item, index) => {
    console.log(`[${verdicts[index].toUpperCase()}] ${item.action}`);
    item.ids.forEach((sourceId, i) => {
      const source = plan.sources.find((s) => s.id === sourceId)!;
      console.log(`    cites ${sourceId} ${source.documentTitle} ${source.sectionRef}: "${item.excerpts[i].replace(/\s+/g, " ").slice(0, 170)}..."`);
    });
    console.log("");
  });

  console.log("KPIs:");
  plan.kpisToMonitor.forEach((kpi) =>
    console.log(`  [${isMeasurableKpi(kpi) ? "measurable" : "NOT measurable"}] ${kpi}`),
  );

  const supporting = [
    Object.values(evalCase.input).join("\n"),
    ...plan.sources.map((s) => s.excerpt),
  ].join("\n");
  const flagged = untraceableFigures(planText(plan), supporting).untraceable;

  console.log(`\nfigures in plan: ${extractFigures(planText(plan)).join(", ") || "none"}`);
  console.log(`untraceable:     ${flagged.join(", ") || "none"}`);

  for (const figure of flagged) {
    const number = figure.replace(/[%C]$/, "");
    const lines = planText(plan)
      .split("\n")
      .filter((line) => line.includes(number));

    lines.forEach((line) => console.log(`  "${figure}" appears in: ${line.slice(0, 220)}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

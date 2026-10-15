import type { Principal } from "@/features/action-plans/domain/permissions";
import type { ServerEnv } from "@/lib/server/env";
import {
  generateActionPlan,
  type ModelCaller,
} from "@/lib/server/generation";
import { judgeFaithfulness } from "./judge";
import {
  containsAny,
  isMeasurableKpi,
  planText,
  untraceableFigures,
} from "./metrics";
import type { EvalWorld } from "./harness";
import type { EvalCase, GenerationCaseResult } from "./types";

const EVAL_ACTOR: Principal = {
  id: "usr_maya_chen",
  name: "Maya Chen",
  role: "sustainability_manager",
  department: null,
};

export type GenerationEvalOptions = {
  world: EvalWorld;
  env: ServerEnv;
  cases: EvalCase[];
  concurrency: number;
  callModel?: ModelCaller;
  judge?: { model: string };
  onProgress?: (done: number, total: number, id: string) => void;
};

async function evaluateCase(
  options: GenerationEvalOptions,
  evalCase: EvalCase,
): Promise<GenerationCaseResult> {
  const { world, env } = options;
  const empty: GenerationCaseResult = {
    ok: false,
    attempts: 0,
    latencyMs: 0,
    inputTokens: null,
    outputTokens: null,
    groundingStatus: null,
    groundingAsExpected: null,
    actions: 0,
    actionsCited: 0,
    citationsDropped: 0,
    citationsKept: 0,
    untraceableFigures: [],
    figuresChecked: 0,
    kpisMeasurable: 0,
    kpisTotal: 0,
    forbiddenTextHits: [],
    staleFactHits: [],
    currentFactUsed: null,
    confidence: null,
  };
  const startedAt = Date.now();

  try {
    const { actionPlan: plan, generation } = await generateActionPlan({
      db: world.db,
      env,
      input: evalCase.input,
      planId: null,
      actor: EVAL_ACTOR,
      // One key per case, so per-user rate limits never distort a run.
      clientKey: `eval-${evalCase.id}`,
      requestId: `eval-${evalCase.id}`,
      getEmbedder: () => world.embedder,
      callModel: options.callModel,
    });

    const text = planText(plan);
    const supporting = [
      Object.values(evalCase.input).join("\n"),
      ...plan.sources.map((source) => source.excerpt),
    ].join("\n");
    const figures = untraceableFigures(text, supporting);
    const expectSources = evalCase.expect.sources;
    const actionsCited = plan.recommendedOperationalActions.filter(
      (item) => item.sourceIds.length > 0,
    ).length;
    const currentFacts = evalCase.expect.currentFacts;

    const result: GenerationCaseResult = {
      ...empty,
      ok: true,
      attempts: generation.attempts,
      latencyMs: generation.latencyMs,
      inputTokens: generation.inputTokens,
      outputTokens: generation.outputTokens,
      groundingStatus: plan.grounding.status,
      groundingAsExpected:
        expectSources === "some"
          ? plan.grounding.status !== "ungrounded"
          : expectSources === "none"
            ? plan.grounding.status === "ungrounded"
            : null,
      actions: plan.recommendedOperationalActions.length,
      actionsCited,
      citationsDropped: generation.citationsDropped,
      citationsKept: plan.recommendedOperationalActions.reduce(
        (sum, item) => sum + item.sourceIds.length,
        0,
      ),
      untraceableFigures: figures.untraceable,
      figuresChecked: figures.checked,
      kpisMeasurable: plan.kpisToMonitor.filter(isMeasurableKpi).length,
      kpisTotal: plan.kpisToMonitor.length,
      forbiddenTextHits: containsAny(text, evalCase.expect.forbiddenText),
      staleFactHits: containsAny(text, evalCase.expect.staleFacts),
      currentFactUsed: currentFacts
        ? containsAny(text, currentFacts).length > 0
        : null,
      confidence: plan.confidenceLevel,
    };

    if (options.judge && env.OPENAI_API_KEY) {
      const items = plan.recommendedOperationalActions
        .filter((item) => item.sourceIds.length > 0)
        .map((item) => ({
          action: item.action,
          excerpts: item.sourceIds
            .map((id) => plan.sources.find((source) => source.id === id)?.excerpt)
            .filter((excerpt): excerpt is string => Boolean(excerpt)),
        }));

      try {
        const verdicts = await judgeFaithfulness({
          apiKey: env.OPENAI_API_KEY,
          baseURL: env.OPENAI_BASE_URL,
          model: options.judge.model,
          timeoutMs: env.OPENAI_TIMEOUT_MS,
          items,
        });

        result.judge = {
          supported: verdicts.filter((v) => v === "supported").length,
          partial: verdicts.filter((v) => v === "partial").length,
          unsupported: verdicts.filter((v) => v === "unsupported").length,
        };
      } catch {
        // A judge failure must not hide the generation result.
      }
    }

    return result;
  } catch (error) {
    return {
      ...empty,
      latencyMs: Date.now() - startedAt,
      error:
        error instanceof Error
          ? `${(error as { code?: string }).code ?? "error"}: ${error.message}`
          : String(error),
    };
  }
}

/** Runs every case through the production generation pipeline. */
export async function runGenerationEval(
  options: GenerationEvalOptions,
): Promise<Map<string, GenerationCaseResult>> {
  const results = new Map<string, GenerationCaseResult>();
  const queue = [...options.cases];
  let done = 0;

  async function worker() {
    for (;;) {
      const next = queue.shift();

      if (!next) {
        return;
      }

      results.set(next.id, await evaluateCase(options, next));
      done += 1;
      options.onProgress?.(done, options.cases.length, next.id);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, options.concurrency) }, worker),
  );

  return results;
}

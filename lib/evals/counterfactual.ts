import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import type { Principal } from "@/features/action-plans/domain/permissions";
import { schema } from "@/lib/server/db";
import type { ServerEnv } from "@/lib/server/env";
import {
  generateActionPlan,
  type ModelCaller,
} from "@/lib/server/generation";
import {
  publishDocument,
  saveDraft,
  withdrawDocument,
} from "@/lib/server/knowledge-admin";
import type { SustainabilityCaseInput } from "@/lib/types";
import type { EvalWorld } from "./harness";

/**
 * A controlled demonstration that retrieval changes the *decision* a plan
 * recommends, not just its wording.
 *
 * One case is generated under three versions of the world, using the real
 * knowledge lifecycle (a draft written by a manager, published by a reviewer):
 *
 *   current policy   the shipped Energy SOP v2: consolidate floors when
 *                    occupancy is below 45% for three or more nights
 *   updated policy   v3, identical except: below 30% for five or more nights
 *   no policy        no Energy SOP is approved
 *
 * The case forecasts 38% for four nights, which meets v2's rule and not v3's.
 */

export const COUNTERFACTUAL_CASE: SustainabilityCaseInput = {
  property: "Harbour House Singapore",
  department: "Engineering",
  issue:
    "Forecast occupancy is very low; should unused floors be consolidated and set back now?",
  currentMetric:
    "Occupancy is forecast at 38 percent for the next four nights, and every floor is still air-conditioned",
  targetMetric:
    "Reduce kilowatt-hours per occupied room over the next two weeks without guest complaints",
  operationalContext:
    "Front Office currently assigns rooms across all floors. Engineering is asking whether to start consolidating rooms onto fewer floors now, or to wait.",
};

export const POLICY_CHANGE = {
  before: "below 45 percent for three or more consecutive nights",
  after: "below 30 percent for five or more consecutive nights",
};

export const DECISIONS = ["consolidate_now", "hold_off", "no_clear_decision"] as const;
export type Decision = (typeof DECISIONS)[number];

export type ConditionId = "current" | "updated" | "none";

export type CounterfactualRun = {
  ok: boolean;
  error?: string;
  grounding: "grounded" | "partial" | "ungrounded" | null;
  decision: Decision | null;
  /** Percent figures that appear in quotations the server verified. */
  figuresInVerifiedQuotes: string[];
  verifiedQuotes: string[];
  /** Documents (title and version) cited by at least one action. */
  citedDocuments: string[];
  policyClaims: number;
  policyClaimsVerified: number;
  actions: string[];
};

export type CounterfactualCondition = {
  id: ConditionId;
  label: string;
  description: string;
  runs: CounterfactualRun[];
};

export type CounterfactualReport = {
  schemaVersion: 1;
  meta: {
    generatedAt: string;
    generationModel: string;
    judgeModel: string;
    embedder: string;
    promptVersion: string;
    runsPerCondition: number;
    gitSha: string | null;
  };
  case: SustainabilityCaseInput;
  change: { document: string; before: string; after: string };
  conditions: CounterfactualCondition[];
  limitations: string[];
};

const MAYA: Principal = {
  id: "usr_maya_chen",
  name: "Maya Chen",
  role: "sustainability_manager",
  department: null,
};
const DANIEL: Principal = {
  id: "usr_daniel_ortiz",
  name: "Daniel Ortiz",
  role: "reviewer",
  department: null,
};

const ENERGY_KEY = "energy-hvac-operations-sop";

export type DecisionClassifier = (args: {
  plan: { situationSummary: string; actions: string[] };
  input: SustainabilityCaseInput;
}) => Promise<Decision>;

const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decision"],
  properties: { decision: { type: "string", enum: [...DECISIONS] } },
} as const;

/**
 * Reads a plan and says which decision it recommends. Done by a model because
 * "start consolidating now" and "wait, the threshold is not met" can be worded
 * many ways; it sees only the case and the plan, never the policy.
 */
export function openAIDecisionClassifier(env: ServerEnv): DecisionClassifier {
  return async ({ plan, input }) => {
    const client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
      timeout: env.OPENAI_TIMEOUT_MS,
      maxRetries: 1,
    });
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      instructions: `You read an operations plan and say which decision it recommends about the question asked in the case. Answer with exactly one:
- "consolidate_now": the plan recommends starting to consolidate rooms onto fewer floors and setting back the unused floors now.
- "hold_off": the plan recommends NOT consolidating yet (for example because a condition is not met) and keeping the current arrangement.
- "no_clear_decision": the plan does not commit either way (generic preparation, monitoring, or "assess first").
Judge only what the plan recommends, not what you think is right.`,
      input: `Case question: ${input.issue}\nSituation: ${input.currentMetric}\n\nPlan summary: ${plan.situationSummary}\n\nRecommended actions:\n${plan.actions.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
      max_output_tokens: 1500,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "decision",
          strict: true,
          schema: CLASSIFY_SCHEMA,
        },
      },
    });

    return (JSON.parse(response.output_text) as { decision: Decision }).decision;
  };
}

/** Percent figures in a quotation, e.g. "45 percent", "30%". */
export function percentFigures(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:percent|%)/gi)].map(
        (match) => `${match[1]}%`,
      ),
    ),
  ];
}

function energyBody() {
  const raw = fs.readFileSync(
    path.join(process.cwd(), "knowledge", `${ENERGY_KEY}.md`),
    "utf8",
  );

  return raw.replace(/^---[\s\S]*?\n---\n+/, "").replace(
    /^> Synthetic document[^\n]*\n+/m,
    "",
  );
}

type Generator = {
  world: EvalWorld;
  env: ServerEnv;
  callModel?: ModelCaller;
  classify: DecisionClassifier;
  runs: number;
  concurrency: number;
  onProgress?: (message: string) => void;
};

async function runCondition(
  generator: Generator,
  condition: Omit<CounterfactualCondition, "runs">,
): Promise<CounterfactualCondition> {
  const { world, env, callModel, classify, runs } = generator;
  const results: CounterfactualRun[] = [];
  const queue = Array.from({ length: runs }, (_, index) => index);

  async function worker() {
    for (;;) {
      const index = queue.shift();

      if (index === undefined) {
        return;
      }

      try {
        const { actionPlan: plan, generation } = await generateActionPlan({
          db: world.db,
          env,
          input: COUNTERFACTUAL_CASE,
          planId: null,
          actor: MAYA,
          clientKey: `counterfactual-${condition.id}-${index}`,
          requestId: `counterfactual-${condition.id}-${index}`,
          getEmbedder: () => world.embedder,
          callModel,
        });
        const actions = plan.recommendedOperationalActions.map((a) => a.action);
        const verified = plan.recommendedOperationalActions.filter(
          (a) => a.claimType === "policy_requirement" && a.evidence,
        );
        const quotes = verified.map((a) => a.evidence!.quote);
        const cited = new Set(
          plan.recommendedOperationalActions.flatMap((a) => a.sourceIds),
        );
        const decision = await classify({
          plan: { situationSummary: plan.situationSummary, actions },
          input: COUNTERFACTUAL_CASE,
        });

        results[index] = {
          ok: true,
          grounding: plan.grounding.status,
          decision,
          figuresInVerifiedQuotes: [...new Set(quotes.flatMap(percentFigures))],
          verifiedQuotes: quotes,
          citedDocuments: [
            ...new Set(
              plan.sources
                .filter((s) => cited.has(s.id))
                .map((s) => `${s.documentTitle} v${s.documentVersion}`),
            ),
          ],
          policyClaims: generation.policyClaims,
          policyClaimsVerified: generation.policyClaimsVerified,
          actions,
        };
      } catch (error) {
        results[index] = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          grounding: null,
          decision: null,
          figuresInVerifiedQuotes: [],
          verifiedQuotes: [],
          citedDocuments: [],
          policyClaims: 0,
          policyClaimsVerified: 0,
          actions: [],
        };
      }

      generator.onProgress?.(`${condition.id} run ${index + 1}/${runs}`);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, generator.concurrency) }, worker),
  );

  return { ...condition, runs: results };
}

/** Finds the approved Energy SOP in the world, if any. */
async function approvedEnergyDocument(world: EvalWorld) {
  const rows = await world.db
    .select()
    .from(schema.knowledgeDocuments)
    .where(eq(schema.knowledgeDocuments.documentKey, ENERGY_KEY));

  return rows.find((row) => row.status === "approved") ?? null;
}

/**
 * Runs the case under the three worlds, in one database, moving it through
 * them with the real lifecycle: current policy, then a published update, then
 * the policy withdrawn.
 */
export async function runCounterfactual(
  generator: Generator,
): Promise<CounterfactualCondition[]> {
  const { world, env } = generator;
  const caps = { userDocumentCap: 20 };
  const publish = { embedder: world.embedder, dailyCap: 1000 };
  const ctx = (actor: Principal) => ({ requestId: "counterfactual", actor });

  if (!(await approvedEnergyDocument(world))) {
    throw new Error("The corpus has no approved Energy SOP to start from.");
  }

  generator.onProgress?.("current policy");
  const current = await runCondition(generator, {
    id: "current",
    label: "Current policy (Energy SOP v2)",
    description: `Consolidate when occupancy is ${POLICY_CHANGE.before}.`,
  });

  generator.onProgress?.("publishing the updated policy through the lifecycle");
  const body = energyBody();

  // The shipped file wraps lines, so match the sentence across whitespace.
  const pattern = new RegExp(
    POLICY_CHANGE.before.split(/\s+/).join("\\s+"),
  );

  if (!pattern.test(body)) {
    throw new Error("The shipped SOP no longer contains the sentence to change.");
  }

  const draft = await saveDraft(
    world.db,
    {
      documentKey: ENERGY_KEY,
      title: "unused for a new version",
      department: "unused",
      documentType: "sop",
      body: body.replace(pattern, POLICY_CHANGE.after),
    },
    ctx(MAYA),
    caps,
  );
  await publishDocument(world.db, draft.document.id, ctx(DANIEL), publish);

  const updated = await runCondition(generator, {
    id: "updated",
    label: "Updated policy (Energy SOP v3)",
    description: `Identical to v2 except: consolidate when occupancy is ${POLICY_CHANGE.after}.`,
  });

  generator.onProgress?.("withdrawing the Energy SOP");
  const live = await approvedEnergyDocument(world);

  if (live) {
    await withdrawDocument(world.db, live.id, "Counterfactual: no policy", ctx(DANIEL));
  }

  const none = await runCondition(generator, {
    id: "none",
    label: "No policy",
    description: "No Energy SOP is approved, so nothing states a threshold.",
  });

  void env;

  return [updated, current, none].sort(
    (a, b) =>
      ["current", "updated", "none"].indexOf(a.id) -
      ["current", "updated", "none"].indexOf(b.id),
  );
}

export function counterfactualLimitations(runs: number): string[] {
  return [
    `One case, ${runs} runs per condition. Generation is non-deterministic, so read the counts as a pattern, not a rate with a confidence interval.`,
    "The updated policy is a one-sentence change I wrote to the shipped SOP, made through the same draft, review and publish steps a user would take. It is a controlled demonstration, not evidence about real policy changes.",
    "The decision is classified by a model that reads only the case and the plan (never the policy). It is the same model family that wrote the plan.",
    "The verified-quotation figures come from the server's own check, so they show what the plan can prove it relied on, independent of the classifier.",
    "The corpus is synthetic.",
  ];
}

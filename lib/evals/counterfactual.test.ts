import { describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import { hashEmbedder } from "@/lib/server/embeddings";
import type { ServerEnv } from "@/lib/server/env";
import type { ModelCaller } from "@/lib/server/generation";
import {
  percentFigures,
  runCounterfactual,
  type Decision,
  type DecisionClassifier,
} from "./counterfactual";
import { buildEvalWorld } from "./harness";

const env = {
  OPENAI_API_KEY: "test",
  OPENAI_MODEL: "test-model",
  OPENAI_MAX_OUTPUT_TOKENS: 8000,
  OPENAI_TIMEOUT_MS: 1000,
  RETRIEVAL_TOP_K: 6,
  GENERATION_LIMIT_PER_HOUR: 1000,
  GENERATION_IP_LIMIT_PER_HOUR: 1000,
  GENERATION_DAILY_CAP: 1000,
} as ServerEnv;

const {
  sources: _s,
  grounding: _g,
  ...basePlan
} = demoActionPlans[0].actionPlan!;
void _s;
void _g;

function sourceText(prompt: string, id: string) {
  const match = prompt.match(
    new RegExp(
      `\\[${id}\\][^\\n]*\\n<source_text>\\n([\\s\\S]*?)\\n</source_text>`,
    ),
  );

  return (match?.[1] ?? "").replace(/\s+/g, " ").trim();
}

/**
 * A stand-in for the model that does what a careful one would: it reads the
 * threshold in the policy it was given, quotes it, and recommends accordingly.
 */
const fakeModel: ModelCaller = async ({ input }) => {
  const s1 = sourceText(input, "S1");
  const mentionsRule = /consecutive nights/.test(s1);
  const quote = s1.slice(0, s1.indexOf("nights") + "nights".length);
  const text = /30 percent/.test(s1)
    ? "Hold off on consolidating floors: forecast occupancy is above the policy threshold."
    : mentionsRule
      ? "Start consolidating rooms onto fewer floors now."
      : "Assess whether consolidating floors would help.";

  return {
    text: JSON.stringify({
      ...basePlan,
      confidenceLevel: "High",
      recommendedOperationalActions: [
        mentionsRule
          ? {
              action: text,
              sourceIds: ["S1"],
              claimType: "policy_requirement",
              evidence: { sourceId: "S1", quote },
            }
          : {
              action: text,
              sourceIds: [],
              claimType: "proposal",
              evidence: null,
            },
      ],
    }),
    inputTokens: 1,
    outputTokens: 1,
  };
};

const classify: DecisionClassifier = async ({ plan }): Promise<Decision> =>
  /hold off/i.test(plan.actions.join(" "))
    ? "hold_off"
    : /start consolidating/i.test(plan.actions.join(" "))
      ? "consolidate_now"
      : "no_clear_decision";

describe("percentFigures", () => {
  it("finds distinct percent figures in either notation", () => {
    expect(percentFigures("below 45 percent, then 45 percent, or 30%")).toEqual(
      ["45%", "30%"],
    );
    expect(percentFigures("no figure here")).toEqual([]);
  });
});

describe("the counterfactual run", () => {
  it("moves one case through current, updated and no policy using the real lifecycle", async () => {
    const world = await buildEvalWorld(hashEmbedder);
    const conditions = await runCounterfactual({
      world,
      env,
      callModel: fakeModel,
      classify,
      runs: 2,
      concurrency: 1,
    });

    expect(conditions.map((c) => c.id)).toEqual(["current", "updated", "none"]);

    const [current, updated, none] = conditions;

    // Each condition cites the version that was approved at the time.
    expect(
      current.runs.every((r) =>
        r.citedDocuments.includes("Energy and HVAC Operations SOP v2"),
      ),
    ).toBe(true);
    expect(
      updated.runs.every((r) =>
        r.citedDocuments.includes("Energy and HVAC Operations SOP v3"),
      ),
    ).toBe(true);
    expect(
      none.runs.every(
        (r) => !r.citedDocuments.some((d) => d.includes("Energy and HVAC")),
      ),
    ).toBe(true);

    // What the plan can prove it relied on changes with the policy.
    expect(
      current.runs.every((r) => r.figuresInVerifiedQuotes.includes("45%")),
    ).toBe(true);
    expect(
      updated.runs.every((r) => r.figuresInVerifiedQuotes.includes("30%")),
    ).toBe(true);
    expect(none.runs.every((r) => r.figuresInVerifiedQuotes.length === 0)).toBe(
      true,
    );

    // And so does the decision.
    expect(current.runs.map((r) => r.decision)).toEqual([
      "consolidate_now",
      "consolidate_now",
    ]);
    expect(updated.runs.map((r) => r.decision)).toEqual([
      "hold_off",
      "hold_off",
    ]);
    expect(none.runs.map((r) => r.decision)).toEqual([
      "no_clear_decision",
      "no_clear_decision",
    ]);
    expect(
      none.runs.every(
        (r) => r.grounding !== "grounded" || r.policyClaimsVerified === 0,
      ),
    ).toBe(true);
  });
});

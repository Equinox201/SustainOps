import { describe, expect, it } from "vitest";
import { buildReport, type EvalMeta } from "./report";
import type {
  EvalCase,
  GenerationCaseResult,
  RetrievalCaseResult,
} from "./types";

const meta: EvalMeta = {
  generatedAt: "2026-10-16T00:00:00.000Z",
  mode: "full",
  embedder: "openai",
  generationModel: "m",
  judgeModel: "j",
  promptVersion: "action-plan-v4-claims",
  topK: 6,
  minScore: 0.4,
  gitSha: null,
  corpus: { documents: 7, approvedDocuments: 6, sections: 49 },
};

const evalCase = (id: string): EvalCase => ({
  id,
  category: "grounded",
  title: id,
  input: {
    property: "P",
    department: "Engineering",
    issue: "i",
    currentMetric: "c",
    targetMetric: "t",
    operationalContext: "o",
  },
  expect: { sources: "some", gold: [], forbiddenSlugs: [] },
});

const retrieval: RetrievalCaseResult = {
  retrieved: [{ id: "S1", slug: "s", sectionRef: "§1", score: 0.6 }],
  goldFound: [],
  goldMissed: [],
  recall: null,
  documentPrecision: null,
  forbiddenHits: [],
  abstainedCorrectly: null,
};

const generation = (
  overrides: Partial<GenerationCaseResult>,
): GenerationCaseResult => ({
  ok: true,
  attempts: 1,
  latencyMs: 1000,
  inputTokens: 1,
  outputTokens: 1,
  groundingStatus: "grounded",
  groundingAsExpected: true,
  actions: 4,
  actionsCited: 4,
  citationsDropped: 0,
  citationsKept: 4,
  policyClaims: 0,
  policyClaimsVerified: 0,
  untraceableFigures: [],
  figuresChecked: 0,
  kpisMeasurable: 0,
  kpisTotal: 0,
  forbiddenTextHits: [],
  staleFactHits: [],
  confidence: "High",
  ...overrides,
});

describe("policy statement metrics", () => {
  it("reports how many claims held up, and judged support for verified vs other actions", () => {
    const report = buildReport({
      meta,
      cases: [evalCase("a"), evalCase("b")],
      retrieval: new Map([
        ["a", retrieval],
        ["b", retrieval],
      ]),
      generation: new Map([
        [
          "a",
          generation({
            policyClaims: 3,
            policyClaimsVerified: 2,
            // 4 cited actions: 2 verified policy (1 supported), 2 others (1 supported).
            judge: { supported: 2, partial: 2, unsupported: 0 },
            judgePolicy: { supported: 1, partial: 1, unsupported: 0 },
          }),
        ],
        [
          "b",
          generation({
            policyClaims: 1,
            policyClaimsVerified: 1,
            judge: { supported: 3, partial: 1, unsupported: 0 },
            judgePolicy: { supported: 1, partial: 0, unsupported: 0 },
          }),
        ],
      ]),
    });
    const policy = report.summary.generation!.policy!;

    // 4 of 8 actions were called policy requirements.
    expect(policy.claimShare).toMatchObject({ numerator: 4, denominator: 8 });
    // 3 of those 4 quotations were found in the source.
    expect(policy.claimsVerified).toMatchObject({
      numerator: 3,
      denominator: 4,
    });
    // Verified policy actions judged: 3 (2 supported). Others: 5 (3 supported).
    expect(policy.supportedVerified).toMatchObject({
      numerator: 2,
      denominator: 3,
    });
    expect(policy.supportedOther).toMatchObject({
      numerator: 3,
      denominator: 5,
    });
  });

  it("omits the judged comparison when no judge ran", () => {
    const report = buildReport({
      meta,
      cases: [evalCase("a")],
      retrieval: new Map([["a", retrieval]]),
      generation: new Map([
        ["a", generation({ policyClaims: 2, policyClaimsVerified: 2 })],
      ]),
    });
    const policy = report.summary.generation!.policy!;

    expect(policy.claimsVerified).toMatchObject({
      numerator: 2,
      denominator: 2,
    });
    expect(policy.supportedVerified).toBeNull();
    expect(policy.supportedOther).toBeNull();
  });
});

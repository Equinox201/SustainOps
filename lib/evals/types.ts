import type { SustainabilityCaseInput } from "@/lib/types";

export type EvalCategory =
  | "grounded" // a good plan should cite specific sections
  | "paraphrase" // same need, written without the corpus vocabulary
  | "trap" // a superseded document says something different
  | "abstain" // nothing in the corpus applies; the system must say so
  | "isolation" // wrong-department content must not leak across
  | "adversarial"; // injection and privacy pressure

export type GoldSection = { slug: string; sectionRef: string };

export type EvalCase = {
  id: string;
  category: EvalCategory;
  title: string;
  input: SustainabilityCaseInput;
  expect: {
    /** Whether retrieval should find anything approved for this case. */
    sources: "some" | "none" | "any";
    /** Sections a competent human would cite. Recall is measured on these. */
    gold: GoldSection[];
    /** Documents that must never be retrieved for this case. */
    forbiddenSlugs: string[];
    /** Strings that must not appear anywhere in the generated plan. */
    forbiddenText?: string[];
    /** A stale figure that must not appear (the trap's wrong answer). */
    staleFacts?: string[];
    /** The current figure; at least one should appear (informational). */
    currentFacts?: string[];
  };
};

export type Proportion = {
  numerator: number;
  denominator: number;
  /** numerator / denominator, or null when there is nothing to measure. */
  rate: number | null;
  /** 95% Wilson interval, or null when denominator is 0. */
  interval: [number, number] | null;
};

export type RetrievalCaseResult = {
  retrieved: Array<{
    id: string;
    slug: string;
    sectionRef: string;
    score: number;
  }>;
  goldFound: GoldSection[];
  goldMissed: GoldSection[];
  /** Share of gold sections retrieved; null when the case has no gold. */
  recall: number | null;
  /** Share of retrieved sections that come from a document holding a gold section. */
  documentPrecision: number | null;
  forbiddenHits: string[];
  abstainedCorrectly: boolean | null;
};

export type JudgeVerdict = "supported" | "partial" | "unsupported";

export type GenerationCaseResult = {
  ok: boolean;
  error?: string;
  attempts: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  groundingStatus: "grounded" | "partial" | "ungrounded" | null;
  groundingAsExpected: boolean | null;
  actions: number;
  actionsCited: number;
  citationsDropped: number;
  citationsKept: number;
  /** Percent/temperature figures in the plan not found in input or sources. */
  untraceableFigures: string[];
  figuresChecked: number;
  kpisMeasurable: number;
  kpisTotal: number;
  forbiddenTextHits: string[];
  staleFactHits: string[];
  currentFactUsed: boolean | null;
  confidence: "Low" | "Medium" | "High" | null;
  judge?: { supported: number; partial: number; unsupported: number };
};

export type CaseReport = {
  id: string;
  category: EvalCategory;
  title: string;
  retrieval: RetrievalCaseResult;
  generation?: GenerationCaseResult;
  /** Hard checks that failed (empty = passed). */
  failures: string[];
};

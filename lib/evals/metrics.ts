import type { AIActionPlan } from "@/lib/types";
import type {
  EvalCase,
  GoldSection,
  Proportion,
  RetrievalCaseResult,
} from "./types";

/** 95% Wilson score interval for a proportion. Sensible even for tiny n. */
export function wilson(
  numerator: number,
  denominator: number,
): [number, number] | null {
  if (denominator === 0) {
    return null;
  }

  const z = 1.96;
  const p = numerator / denominator;
  const n = denominator;
  const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) /
    (1 + (z * z) / n);

  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

export function proportion(numerator: number, denominator: number): Proportion {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
    interval: wilson(numerator, denominator),
  };
}

/** Linear-interpolated percentile (p in 0..100) of a list of numbers. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

export const mean = (values: number[]) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

// ---- figures ---------------------------------------------------------------

/**
 * Percentages and temperatures are the figures that read as policy
 * thresholds ("escalate above 10 percent", "set back to 26 degrees").
 * Durations and counts ("14 days", "five-minute briefing") are usually the
 * plan's own proposals, so they are deliberately not checked.
 */
export function extractFigures(text: string): string[] {
  const figures = new Set<string>();
  const percent = /(\d+(?:\.\d+)?)\s*(?:%|per\s?cent|percent|percentage points?)/gi;
  const degrees = /(\d+(?:\.\d+)?)\s*(?:°\s*c|degrees?(?:\s+celsius)?|celsius)/gi;

  for (const match of text.matchAll(percent)) {
    figures.add(`${Number(match[1])}%`);
  }

  for (const match of text.matchAll(degrees)) {
    figures.add(`${Number(match[1])}C`);
  }

  return [...figures];
}

/** Figures in `plan` that appear in neither `input` nor `sources`. */
export function untraceableFigures(
  planText: string,
  supportingText: string,
): { checked: number; untraceable: string[] } {
  const planFigures = extractFigures(planText);
  const known = new Set(extractFigures(supportingText));

  return {
    checked: planFigures.length,
    untraceable: planFigures.filter((figure) => !known.has(figure)),
  };
}

// ---- plan text -------------------------------------------------------------

export function planText(plan: AIActionPlan): string {
  return [
    plan.situationSummary,
    ...plan.likelyRootCauses,
    ...plan.recommendedOperationalActions.map((item) => item.action),
    plan.staffMicroTrainingMessage,
    ...plan.managerChecklist,
    ...plan.kpisToMonitor,
    ...plan.governancePrivacyNotes,
    ...plan.followUpRecommendations,
  ].join("\n");
}

export function containsAny(text: string, needles: string[] = []): string[] {
  const haystack = text.toLowerCase();

  return needles.filter((needle) => haystack.includes(needle.toLowerCase()));
}

/**
 * A KPI is "measurable" if it names a number, a rate or share, a count, or a
 * unit of measure. This is a deliberately loose heuristic: it asks "could this
 * be written down as a number?", not "is this a good KPI?".
 *
 * Revised after the first full run: the original pattern missed plainly
 * countable KPIs such as "Number of attendant briefings completed" and
 * "Percentage of rooms with a reuse card", understating measurability.
 */
const MEASURABLE_KPI =
  /\d|%|\bper\b|\brate\b|\bratio\b|\bpercent(?:age)?\b|\bnumber of\b|\bcount\b|\bshare\b|\bproportion\b|\baverage\b|\btotal\b|\bfrequency\b|\bcompletion\b|\bcoverage\b|\bscore\b|\bcost\b|\bspend\b|\bkg\b|\bkwh\b|\bgrams?\b|\blit(?:re|er)s?\b|\bcovers?\b|\bhours?\b|\bdays?\b|\bminutes?\b/i;

export function isMeasurableKpi(kpi: string): boolean {
  return MEASURABLE_KPI.test(kpi);
}

// ---- retrieval -------------------------------------------------------------

const key = (section: GoldSection) => `${section.slug}|${section.sectionRef}`;

export type RetrievedRef = {
  id: string;
  slug: string;
  sectionRef: string;
  score: number;
};

export function scoreRetrieval(
  evalCase: EvalCase,
  retrieved: RetrievedRef[],
): RetrievalCaseResult {
  const { gold, forbiddenSlugs, sources } = evalCase.expect;
  const retrievedKeys = new Set(retrieved.map(key));
  const goldFound = gold.filter((section) => retrievedKeys.has(key(section)));
  const goldMissed = gold.filter((section) => !retrievedKeys.has(key(section)));
  const goldDocuments = new Set(gold.map((section) => section.slug));

  return {
    retrieved,
    goldFound,
    goldMissed,
    recall: gold.length === 0 ? null : goldFound.length / gold.length,
    documentPrecision:
      gold.length === 0 || retrieved.length === 0
        ? null
        : retrieved.filter((item) => goldDocuments.has(item.slug)).length /
          retrieved.length,
    forbiddenHits: [
      ...new Set(
        retrieved
          .filter((item) => forbiddenSlugs.includes(item.slug))
          .map((item) => item.slug),
      ),
    ],
    abstainedCorrectly:
      sources === "none"
        ? retrieved.length === 0
        : sources === "some"
          ? retrieved.length > 0
          : null,
  };
}

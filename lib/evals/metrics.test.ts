import { describe, expect, it } from "vitest";
import {
  containsAny,
  extractFigures,
  isMeasurableKpi,
  percentile,
  proportion,
  scoreRetrieval,
  untraceableFigures,
  wilson,
} from "./metrics";
import type { EvalCase } from "./types";

describe("wilson interval", () => {
  it("is null for no data and bounded for extremes", () => {
    expect(wilson(0, 0)).toBeNull();

    const [lowAll, highAll] = wilson(10, 10)!;
    expect(highAll).toBe(1);
    expect(lowAll).toBeGreaterThan(0.69);
    expect(lowAll).toBeLessThan(0.75);

    const [lowNone, highNone] = wilson(0, 10)!;
    expect(lowNone).toBe(0);
    expect(highNone).toBeGreaterThan(0.25);
  });

  it("widens as the sample shrinks, which is the honest part", () => {
    const [low20, high20] = wilson(18, 20)!;
    const [low200, high200] = wilson(180, 200)!;

    expect(high20 - low20).toBeGreaterThan(high200 - low200);
  });
});

describe("proportion and percentile", () => {
  it("reports the rate and refuses to invent one for an empty set", () => {
    expect(proportion(3, 4)).toMatchObject({ rate: 0.75, numerator: 3 });
    expect(proportion(0, 0)).toMatchObject({ rate: null, interval: null });
  });

  it("interpolates percentiles", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10], 95)).toBe(10);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("figure extraction", () => {
  it("finds percentages and temperatures in their common spellings", () => {
    expect(
      extractFigures(
        "Escalate above 10 percent, or 12.5% for a week; hold at 26 degrees Celsius or 24°C.",
      ).sort(),
    ).toEqual(["10%", "12.5%", "24C", "26C"].sort());
  });

  it("ignores durations and counts, which are the plan's own proposals", () => {
    expect(extractFigures("Run a 14 day pilot with 5 briefings of 15 minutes")).toEqual([]);
  });

  it("flags figures that appear in neither the case nor the sources", () => {
    const result = untraceableFigures(
      "Escalate at 10 percent and set rooms back to 28 degrees.",
      "Escalate when intensity exceeds baseline by more than 10 percent.",
    );

    expect(result).toEqual({ checked: 2, untraceable: ["28C"] });
  });
});

describe("plan checks", () => {
  it("matches forbidden text case-insensitively", () => {
    expect(containsAny("Contact MR TAN in 1204", ["Mr Tan", "0815"])).toEqual([
      "Mr Tan",
    ]);
  });

  it("treats a KPI as measurable when it names a number, rate or unit", () => {
    expect(isMeasurableKpi("Laundry kg per occupied room per day")).toBe(true);
    expect(isMeasurableKpi("Pastry waste below 8%")).toBe(true);
    expect(isMeasurableKpi("Staff morale improves")).toBe(false);
  });

  it("recognises plainly countable KPIs the first heuristic missed", () => {
    expect(isMeasurableKpi("Number of attendant briefings completed")).toBe(true);
    expect(isMeasurableKpi("Percentage of rooms with a reuse card")).toBe(true);
    expect(isMeasurableKpi("Supplier scorecard completion")).toBe(true);
    expect(isMeasurableKpi("Brand perception")).toBe(false);
  });
});

describe("scoreRetrieval", () => {
  const base: EvalCase = {
    id: "x",
    category: "grounded",
    title: "x",
    input: {
      property: "p",
      department: "Housekeeping",
      issue: "i",
      currentMetric: "c",
      targetMetric: "t",
      operationalContext: "o",
    },
    expect: {
      sources: "some",
      gold: [
        { slug: "hk", sectionRef: "§4.2" },
        { slug: "hk", sectionRef: "§4.3" },
      ],
      forbiddenSlugs: ["hk-v1"],
    },
  };
  const ref = (slug: string, sectionRef: string, score = 0.6) => ({
    id: "S1",
    slug,
    sectionRef,
    score,
  });

  it("computes recall on gold sections and precision at document level", () => {
    const result = scoreRetrieval(base, [
      ref("hk", "§4.2"),
      ref("hk", "§1.1"),
      ref("policy", "§2.1"),
    ]);

    expect(result.recall).toBe(0.5);
    expect(result.goldMissed).toEqual([{ slug: "hk", sectionRef: "§4.3" }]);
    expect(result.documentPrecision).toBeCloseTo(2 / 3);
    expect(result.forbiddenHits).toEqual([]);
  });

  it("flags forbidden documents", () => {
    const result = scoreRetrieval(base, [ref("hk-v1", "§4.2")]);

    expect(result.forbiddenHits).toEqual(["hk-v1"]);
  });

  it("scores abstention for cases that should find nothing", () => {
    const none: EvalCase = {
      ...base,
      expect: { sources: "none", gold: [], forbiddenSlugs: [] },
    };

    expect(scoreRetrieval(none, []).abstainedCorrectly).toBe(true);
    expect(scoreRetrieval(none, [ref("policy", "§1.1")]).abstainedCorrectly).toBe(
      false,
    );
    expect(scoreRetrieval(none, []).recall).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { checkQuote, normalizeForQuote } from "./provenance";

const EXCERPT = `### 2.2 Low-occupancy floor consolidation
When forecast occupancy is below 45 percent for three or more consecutive
nights, Front Office assigns rooms by floor where guest preferences allow, so
that Engineering can place unused floors in reduced mode.`;

describe("normalizeForQuote", () => {
  it("flattens case, whitespace, typographic punctuation and emphasis", () => {
    expect(normalizeForQuote("  It’s  **WELL**\n— known ")).toBe(
      "it's well - known",
    );
  });
});

describe("checkQuote", () => {
  it("accepts a verbatim quotation, ignoring line breaks and case", () => {
    const result = checkQuote(
      "When forecast occupancy is below 45 percent for three or more consecutive nights",
      EXCERPT,
    );

    expect(result.ok).toBe(true);
  });

  it("maps the match back onto the original excerpt for highlighting", () => {
    const quote = "Front Office assigns rooms by floor";
    const result = checkQuote(quote, EXCERPT);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(EXCERPT.slice(result.start, result.end)).toBe(quote);
    }
  });

  it("highlights across a line break using the original text", () => {
    const result = checkQuote(
      "three or more consecutive nights, Front Office assigns rooms",
      EXCERPT,
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(EXCERPT.slice(result.start, result.end)).toContain("\nnights,");
    }
  });

  it("rejects a paraphrase", () => {
    expect(
      checkQuote(
        "Rooms are allocated floor by floor when occupancy drops under 45%",
        EXCERPT,
      ),
    ).toEqual({ ok: false, reason: "quote_not_found" });
  });

  it("rejects an altered figure", () => {
    expect(
      checkQuote(
        "When forecast occupancy is below 40 percent for three or more consecutive nights",
        EXCERPT,
      ),
    ).toEqual({ ok: false, reason: "quote_not_found" });
  });

  it("rejects a quotation too short to prove anything", () => {
    expect(checkQuote("reduced mode", EXCERPT)).toEqual({
      ok: false,
      reason: "quote_too_short",
    });
    expect(checkQuote("is below 45", EXCERPT)).toEqual({
      ok: false,
      reason: "quote_too_short",
    });
  });

  it("rejects an empty quotation", () => {
    expect(checkQuote("   ", EXCERPT)).toEqual({
      ok: false,
      reason: "quote_too_short",
    });
  });
});

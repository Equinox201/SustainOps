import { describe, expect, it } from "vitest";
import { hashEmbed } from "./embeddings";

const cosine = (a: number[], b: number[]) =>
  a.reduce((sum, value, index) => sum + value * b[index], 0);

describe("hash embedder", () => {
  it("is deterministic and unit length", () => {
    const first = hashEmbed("Run washers at full load during low occupancy.");
    const second = hashEmbed("Run washers at full load during low occupancy.");

    expect(first).toEqual(second);
    expect(first).toHaveLength(1536);
    expect(Math.hypot(...first)).toBeCloseTo(1, 6);
  });

  it("scores related text above unrelated text", () => {
    const query = hashEmbed("laundry volume above baseline, batching washer loads");
    const related = hashEmbed("Run washers at or above 85 percent of rated load; batch laundry.");
    const unrelated = hashEmbed("Supplier scorecards and packaging recertification.");

    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });

  it("treats simple inflections alike", () => {
    expect(
      cosine(hashEmbed("croissants replenished"), hashEmbed("croissant replenishing")),
    ).toBeGreaterThan(0.5);
  });

  it("returns a zero vector for empty text instead of NaN", () => {
    expect(hashEmbed("   ").every((value) => value === 0)).toBe(true);
  });
});

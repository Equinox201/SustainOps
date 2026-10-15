import { describe, expect, it } from "vitest";
import { NEW_PLAN_SEGMENT, parsePlanPath, planPath } from "./routes";

describe("plan URLs", () => {
  it("builds and parses plan paths", () => {
    expect(planPath("abc-123")).toBe("/plans/abc-123");
    expect(parsePlanPath("/plans/abc-123")).toBe("abc-123");
    expect(parsePlanPath("/plans/abc-123/")).toBe("abc-123");
  });

  it("uses a reserved segment for a blank case", () => {
    expect(planPath(null)).toBe(`/plans/${NEW_PLAN_SEGMENT}`);
    expect(parsePlanPath("/plans/new")).toBe("new");
  });

  it("treats everything else as the list", () => {
    for (const path of ["/", "/evals", "/plans", "/plans/a/b", null]) {
      expect(parsePlanPath(path)).toBeNull();
    }
  });

  it("round-trips ids that need encoding", () => {
    const id = "demo plan/1";

    expect(parsePlanPath(planPath(id))).toBe(id);
  });

  it("does not throw on malformed percent-encoding", () => {
    expect(parsePlanPath("/plans/%E0%A4%A")).toBeNull();
  });
});

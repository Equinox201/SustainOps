import { describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import { isDraftDirty } from "./dirty";
import { draftToContent, planToDraft } from "./lifecycle";

const draft = planToDraft(demoActionPlans[0]);
const baseline = draftToContent(draft);

describe("isDraftDirty", () => {
  it("is clean when nothing changed", () => {
    expect(isDraftDirty(draft, baseline)).toBe(false);
  });

  it("notices an edited field", () => {
    expect(isDraftDirty({ ...draft, owner: "Someone Else" }, baseline)).toBe(
      true,
    );
    expect(
      isDraftDirty(
        { ...draft, kpiProgress: { ...draft.kpiProgress, current: "9" } },
        baseline,
      ),
    ).toBe(true);
  });

  it("ignores server-owned fields that are not user edits", () => {
    expect(
      isDraftDirty(
        { ...draft, version: 99, updatedAt: "2030-01-01T00:00:00Z" },
        baseline,
      ),
    ).toBe(false);
  });

  it("is clean when there is no draft or no baseline", () => {
    expect(isDraftDirty(null, baseline)).toBe(false);
    expect(isDraftDirty(draft, null)).toBe(false);
  });
});

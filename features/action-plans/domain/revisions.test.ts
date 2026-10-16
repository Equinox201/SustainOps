import { describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { RevisionSnapshot } from "@/lib/types";
import { diffSnapshots } from "./revisions";

function snapshot(): RevisionSnapshot {
  const demo = demoActionPlans[0];

  return {
    sustainabilityCase: demo.sustainabilityCase,
    actionPlan: demo.actionPlan,
    owner: "Jordan Lee",
    priority: "High",
    targetDate: "2026-12-01",
    nextReviewDate: "2026-11-01",
    readinessChecklist: demo.readinessChecklist,
    kpiProgress: demo.kpiProgress,
    approved: false,
    completed: false,
    reviewStatus: "none",
    reviewComment: null,
  };
}

describe("diffSnapshots", () => {
  it("reports nothing for identical versions", () => {
    expect(diffSnapshots(snapshot(), snapshot())).toEqual({
      fields: [],
      actions: [],
      planTextChanged: false,
    });
  });

  it("names changed fields with before and after values", () => {
    const next = { ...snapshot(), priority: "Low" as const, approved: true };
    const diff = diffSnapshots(snapshot(), next);

    expect(diff.fields).toEqual([
      { label: "Priority", before: "High", after: "Low" },
      { label: "Approved", before: "no", after: "yes" },
    ]);
  });

  it("matches actions by id: reworded, added, removed and progressed", () => {
    const before = snapshot();
    const items = before.actionPlan!.recommendedOperationalActions;
    const after: RevisionSnapshot = {
      ...before,
      actionPlan: {
        ...before.actionPlan!,
        recommendedOperationalActions: [
          { ...items[0], action: "Reworded" },
          {
            ...items[1],
            status: "blocked",
            blockedReason: "Waiting on vendor",
          },
          {
            ...items[0],
            id: "00000000-0000-4000-8000-000000000001",
            action: "A new one",
            origin: "human",
          },
        ],
      },
    };

    const kinds = diffSnapshots(before, after).actions.map((c) =>
      c.kind === "tracking" ? `tracking:${c.field}` : c.kind,
    );

    expect(kinds).toContain("edited");
    expect(kinds).toContain("added");
    expect(kinds).toContain("removed"); // the rest of the original actions
    expect(kinds).toContain("tracking:status");
    expect(kinds).toContain("tracking:blockedReason");
  });

  it("flags changes to the generated text separately from actions", () => {
    const before = snapshot();
    const after = {
      ...before,
      actionPlan: {
        ...before.actionPlan!,
        situationSummary: "A different summary.",
      },
    };

    expect(diffSnapshots(before, after).planTextChanged).toBe(true);
  });
});

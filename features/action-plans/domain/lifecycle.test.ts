import { describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { StoredActionPlan } from "@/lib/types";
import {
  draftToPlan,
  isReadyForApproval,
  planToDraft,
  transitionPlan,
} from "./lifecycle";

const NOW = "2026-10-06T09:00:00.000Z";

const readyChecklist: StoredActionPlan["readinessChecklist"] = {
  actionsAreSpecific: true,
  kpisAreMeasurable: true,
  ownerAssigned: true,
  timelineDefined: true,
  privacyReviewed: true,
  staffMessageReady: true,
};

function makePlan(overrides: Partial<StoredActionPlan> = {}): StoredActionPlan {
  return {
    ...demoActionPlans[0],
    owner: "Jordan Lee",
    targetDate: "2026-12-01",
    nextReviewDate: "2026-11-01",
    readinessChecklist: { ...readyChecklist },
    approved: false,
    completed: false,
    ...overrides,
  };
}

describe("isReadyForApproval", () => {
  it("passes when owner, dates and every checklist item are complete", () => {
    expect(isReadyForApproval(makePlan())).toBe(true);
  });

  it("fails when any checklist item is missing", () => {
    const plan = makePlan({
      readinessChecklist: { ...readyChecklist, privacyReviewed: false },
    });

    expect(isReadyForApproval(plan)).toBe(false);
  });

  it.each(["owner", "targetDate", "nextReviewDate"] as const)(
    "fails when %s is blank",
    (field) => {
      expect(isReadyForApproval(makePlan({ [field]: "   " }))).toBe(false);
    },
  );
});

describe("transitionPlan", () => {
  it("approves a ready plan and returns the full persisted state", () => {
    const result = transitionPlan(makePlan(), "approve", NOW);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.plan).toMatchObject({
        approved: true,
        completed: false,
        updatedAt: NOW,
        governanceReview: {
          approvedOperationalUse: true,
          reviewerStatus: "Approved",
        },
      });
    }
  });

  it("refuses approval until the plan is ready", () => {
    const result = transitionPlan(makePlan({ owner: "" }), "approve", NOW);

    expect(result).toEqual({ ok: false, error: "not_ready" });
  });

  it("refuses approval when no action plan has been generated", () => {
    const result = transitionPlan(makePlan({ actionPlan: null }), "approve", NOW);

    expect(result).toEqual({ ok: false, error: "not_generated" });
  });

  it("refuses to approve twice", () => {
    const result = transitionPlan(makePlan({ approved: true }), "approve", NOW);

    expect(result).toEqual({ ok: false, error: "already_approved" });
  });

  it("completes only an approved plan", () => {
    expect(transitionPlan(makePlan(), "complete", NOW)).toEqual({
      ok: false,
      error: "not_approved",
    });

    const result = transitionPlan(makePlan({ approved: true }), "complete", NOW);

    expect(result.ok && result.plan).toMatchObject({
      approved: true,
      completed: true,
      governanceReview: { reviewerStatus: "Approved" },
    });
  });

  it("resets approval back to pending", () => {
    const result = transitionPlan(
      makePlan({ approved: true }),
      "reset_approval",
      NOW,
    );

    expect(result.ok && result.plan).toMatchObject({
      approved: false,
      completed: false,
      governanceReview: {
        approvedOperationalUse: false,
        reviewerStatus: "Pending",
      },
    });
  });

  it("locks completed plans against every further change", () => {
    const completed = makePlan({ approved: true, completed: true });

    for (const event of ["approve", "complete", "reset_approval"] as const) {
      expect(transitionPlan(completed, event, NOW)).toEqual({
        ok: false,
        error: "already_completed",
      });
    }
  });

  it("does not mutate the plan it was given", () => {
    const plan = makePlan();
    const snapshot = structuredClone(plan);

    transitionPlan(plan, "approve", NOW);

    expect(plan).toEqual(snapshot);
  });
});

describe("draftToPlan", () => {
  it("creates a new plan with an id and timestamps for an unsaved draft", () => {
    const draft = { ...planToDraft(makePlan()), id: null, createdAt: null };
    const result = draftToPlan(draft, NOW);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.plan.id).toEqual(expect.any(String));
      expect(result.plan.createdAt).toBe(NOW);
      expect(result.plan.updatedAt).toBe(NOW);
    }
  });

  it("keeps the id and creation time of an existing plan", () => {
    const plan = makePlan();
    const result = draftToPlan(planToDraft(plan), NOW);

    expect(result.ok && result.plan).toMatchObject({
      id: plan.id,
      createdAt: plan.createdAt,
      updatedAt: NOW,
    });
  });

  it("rejects a draft without a generated action plan", () => {
    const draft = { ...planToDraft(makePlan()), actionPlan: null };

    expect(draftToPlan(draft, NOW)).toEqual({
      ok: false,
      error: "not_generated",
    });
  });

  it("rejects a draft with an incomplete case", () => {
    const draft = planToDraft(makePlan());
    draft.sustainabilityCase = { ...draft.sustainabilityCase, issue: " " };

    expect(draftToPlan(draft, NOW)).toEqual({
      ok: false,
      error: "case_incomplete",
    });
  });

  it("approving an edited draft stores the edits and the approval together", () => {
    const draft = {
      ...planToDraft(makePlan()),
      id: null,
      createdAt: null,
      actionNotes: "Reviewed with Front Office",
    };
    const saved = draftToPlan(draft, NOW);

    expect(saved.ok).toBe(true);

    if (!saved.ok) {
      return;
    }

    const approved = transitionPlan(saved.plan, "approve", NOW);

    expect(approved.ok && approved.plan).toMatchObject({
      actionNotes: "Reviewed with Front Office",
      approved: true,
    });
  });
});

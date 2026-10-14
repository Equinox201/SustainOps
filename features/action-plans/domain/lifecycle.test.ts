import { describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { StoredActionPlan } from "@/lib/types";
import {
  applyContentUpdate,
  checkDraftSavable,
  createPlanFromContent,
  draftToContent,
  isReadyForApproval,
  planToContent,
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
    generationId: null,
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

describe("createPlanFromContent", () => {
  it("creates an unapproved plan with the given id and timestamps", () => {
    const content = planToContent(makePlan());
    const result = createPlanFromContent(content, {
      id: "plan-1",
      now: NOW,
      generatedAt: "2026-10-05T08:00:00.000Z",
    });

    expect(result.ok && result.plan).toMatchObject({
      id: "plan-1",
      approved: false,
      completed: false,
      createdAt: NOW,
      updatedAt: NOW,
      governanceReview: {
        reviewerStatus: "Pending",
        auditTimestamp: "2026-10-05T08:00:00.000Z",
      },
    });
  });

  it("rejects content without a generated action plan", () => {
    const content = { ...planToContent(makePlan()), actionPlan: null };

    expect(
      createPlanFromContent(content, { id: "x", now: NOW, generatedAt: null }),
    ).toEqual({ ok: false, error: "not_generated" });
  });
});

describe("applyContentUpdate", () => {
  const options = { now: NOW, generatedAt: null };

  it("applies any edit to a plan that is not approved", () => {
    const content = { ...planToContent(makePlan()), owner: "Sam Ortiz" };
    const result = applyContentUpdate(makePlan(), content, options);

    expect(result.ok && result.plan).toMatchObject({
      owner: "Sam Ortiz",
      updatedAt: NOW,
    });
  });

  it("locks case, owner and AI output after approval", () => {
    const approved = makePlan({ approved: true });
    const content = { ...planToContent(approved), owner: "Sam Ortiz" };

    expect(applyContentUpdate(approved, content, options)).toEqual({
      ok: false,
      error: "plan_locked",
    });
  });

  it("still allows notes and KPI updates after approval", () => {
    const approved = makePlan({ approved: true });
    const content = {
      ...planToContent(approved),
      actionNotes: "Briefing delivered",
      kpiProgress: { ...approved.kpiProgress, current: "1,100 kg" },
    };
    const result = applyContentUpdate(approved, content, options);

    expect(result.ok && result.plan).toMatchObject({
      actionNotes: "Briefing delivered",
      kpiProgress: { current: "1,100 kg" },
    });
  });

  it("allows only notes once completed", () => {
    const done = makePlan({ approved: true, completed: true });
    const withKpi = {
      ...planToContent(done),
      kpiProgress: { ...done.kpiProgress, current: "changed" },
    };
    const withNotes = { ...planToContent(done), actionNotes: "Closed out" };

    expect(applyContentUpdate(done, withKpi, options)).toEqual({
      ok: false,
      error: "plan_locked",
    });
    expect(applyContentUpdate(done, withNotes, options).ok).toBe(true);
  });

  it("refreshes the audit timestamp when the plan is regenerated", () => {
    const content = {
      ...planToContent(makePlan()),
      generationId: "6f0c3c1e-5b8e-4a55-9d3c-0e3f6a1b2c3d",
    };
    const result = applyContentUpdate(makePlan(), content, {
      now: NOW,
      generatedAt: "2026-10-06T08:30:00.000Z",
    });

    expect(result.ok && result.plan.governanceReview.auditTimestamp).toBe(
      "2026-10-06T08:30:00.000Z",
    );
  });
});

describe("draft helpers", () => {
  it("round-trips a plan through a draft without losing content", () => {
    const plan = makePlan();

    expect(draftToContent(planToDraft(plan))).toEqual(planToContent(plan));
  });

  it("flags drafts that cannot be saved yet", () => {
    const draft = planToDraft(makePlan());

    expect(checkDraftSavable(draft)).toBeNull();
    expect(checkDraftSavable({ ...draft, actionPlan: null })).toBe(
      "not_generated",
    );
    expect(
      checkDraftSavable({
        ...draft,
        sustainabilityCase: { ...draft.sustainabilityCase, issue: " " },
      }),
    ).toBe("case_incomplete");
  });
});

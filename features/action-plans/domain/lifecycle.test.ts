import { describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { StoredActionPlan } from "@/lib/types";
import type { ActorRef } from "@/lib/types";
import { changedCaseFields, getCaseDrift } from "./action-items";
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
    const result = transitionPlan(
      makePlan({ actionPlan: null }),
      "approve",
      NOW,
    );

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

    const result = transitionPlan(
      makePlan({ approved: true }),
      "complete",
      NOW,
    );

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

const AUTHOR: ActorRef = {
  id: "usr_maya_chen",
  name: "Maya Chen",
  role: "sustainability_manager",
};
const REVIEWER: ActorRef = {
  id: "usr_daniel_ortiz",
  name: "Daniel Ortiz",
  role: "reviewer",
};

describe("review decisions", () => {
  it("records the approver and approval time", () => {
    const result = transitionPlan(makePlan(), "approve", NOW, {
      actor: REVIEWER,
    });

    expect(result.ok && result.plan).toMatchObject({
      approvedBy: REVIEWER,
      approvedAt: NOW,
    });
  });

  it("does not let a plan's author approve it", () => {
    const plan = makePlan({ createdBy: AUTHOR });

    expect(transitionPlan(plan, "approve", NOW, { actor: AUTHOR })).toEqual({
      ok: false,
      error: "self_approval_forbidden",
    });
  });

  it("clears the approver when approval is reset", () => {
    const approved = makePlan({
      approved: true,
      approvedBy: REVIEWER,
      approvedAt: NOW,
    });
    const result = transitionPlan(approved, "reset_approval", NOW);

    expect(result.ok && result.plan).toMatchObject({
      approvedBy: null,
      approvedAt: null,
    });
  });

  it("requires a comment to request changes", () => {
    expect(transitionPlan(makePlan(), "request_changes", NOW)).toEqual({
      ok: false,
      error: "comment_required",
    });

    const result = transitionPlan(makePlan(), "request_changes", NOW, {
      actor: REVIEWER,
      comment: "  Clarify the owner.  ",
    });

    expect(result.ok && result.plan).toMatchObject({
      reviewStatus: "changes_requested",
      reviewComment: "Clarify the owner.",
      governanceReview: { reviewerStatus: "Needs Revision" },
    });
  });

  it("cannot request changes on an approved plan", () => {
    expect(
      transitionPlan(makePlan({ approved: true }), "request_changes", NOW, {
        comment: "No",
      }),
    ).toEqual({ ok: false, error: "already_approved" });
  });
});

describe("createPlanFromContent", () => {
  it("creates an unapproved plan with the given id and timestamps", () => {
    const content = planToContent(makePlan());
    const result = createPlanFromContent(content, {
      id: "plan-1",
      now: NOW,
      generatedAt: "2026-10-05T08:00:00.000Z",
      generation: null,
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
      createPlanFromContent(content, {
        id: "x",
        now: NOW,
        generatedAt: null,
        generation: null,
      }),
    ).toEqual({ ok: false, error: "not_generated" });
  });
});

describe("applyContentUpdate", () => {
  const options = { now: NOW, generatedAt: null, generation: null };

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
      generation: {
        input: content.sustainabilityCase,
        output: content.actionPlan!,
      },
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

describe("provenance when creating a plan", () => {
  it("takes AI provenance only from a matching recorded generation", () => {
    const base = makePlan();
    const content = planToContent(base);
    const generation = {
      input: base.sustainabilityCase,
      output: content.actionPlan!,
    };
    const result = createPlanFromContent(content, {
      id: "p",
      now: NOW,
      generatedAt: NOW,
      generation,
    });

    expect(result.ok && result.plan).toMatchObject({
      originalAiOutput: generation.output,
      generatedCase: generation.input,
      driftAcknowledged: false,
    });
  });

  it("refuses a plan that differs from what was generated", () => {
    const base = makePlan();
    const content = planToContent(base);
    const tampered = {
      ...content,
      actionPlan: {
        ...content.actionPlan!,
        situationSummary: "Rewritten by the client",
      },
    };

    expect(
      createPlanFromContent(tampered, {
        id: "p",
        now: NOW,
        generatedAt: NOW,
        generation: {
          input: base.sustainabilityCase,
          output: content.actionPlan!,
        },
      }),
    ).toEqual({ ok: false, error: "plan_differs_from_generation" });
  });

  it("treats a plan with no generation as the author's own work", () => {
    const content = planToContent(makePlan());
    const result = createPlanFromContent(content, {
      id: "p",
      now: NOW,
      generatedAt: null,
      generation: null,
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      const plan = result.plan.actionPlan!;

      expect(result.plan.originalAiOutput).toBeNull();
      expect(result.plan.generatedCase).toBeNull();
      expect(plan.sources).toEqual([]);
      expect(plan.grounding.status).toBe("ungrounded");
      expect(
        plan.recommendedOperationalActions.every(
          (item) =>
            item.origin === "human" &&
            item.sourceIds.length === 0 &&
            item.claimType === "proposal" &&
            item.evidence === null,
        ),
      ).toBe(true);
    }
  });
});

describe("editing a plan that came from a generation", () => {
  it("refuses changes to the generated text, and to detaching the generation", () => {
    const plan = makePlan();
    const content = planToContent(plan);
    const edit = (change: Partial<typeof content>) =>
      applyContentUpdate(plan, { ...content, ...change }, {
        now: NOW,
        generatedAt: null,
        generation: null,
      });

    expect(
      edit({
        actionPlan: { ...content.actionPlan!, situationSummary: "Changed" },
      }),
    ).toEqual({ ok: false, error: "generated_text_locked" });
  });

  it("keeps provenance fields server-side: a client cannot relabel an action", () => {
    const plan = makePlan();
    const content = planToContent(plan);
    const [first, ...rest] = content.actionPlan!.recommendedOperationalActions;
    const forged = {
      ...first,
      origin: "human" as const,
      claimType: "policy_requirement" as const,
      evidence: { sourceId: "S1", quote: "an invented quotation from a source" },
      sourceIds: ["S1"],
    };
    const result = applyContentUpdate(
      plan,
      {
        ...content,
        actionPlan: {
          ...content.actionPlan!,
          recommendedOperationalActions: [forged, ...rest],
        },
      },
      { now: NOW, generatedAt: null, generation: null },
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      const kept = result.plan.actionPlan!.recommendedOperationalActions[0];
      const before = plan.actionPlan!.recommendedOperationalActions[0];

      expect(kept).toMatchObject({
        origin: before.origin,
        claimType: before.claimType,
        evidence: before.evidence,
        sourceIds: before.sourceIds,
      });
    }
  });

  it("drops a policy claim to a proposal when a person rewords the action", () => {
    const base = makePlan();
    const first = base.actionPlan!.recommendedOperationalActions[0];
    const plan = {
      ...base,
      actionPlan: {
        ...base.actionPlan!,
        recommendedOperationalActions: [
          {
            ...first,
            sourceIds: ["S1"],
            claimType: "policy_requirement" as const,
            evidence: { sourceId: "S1", quote: "a verified quotation here" },
          },
          ...base.actionPlan!.recommendedOperationalActions.slice(1),
        ],
      },
    };
    const content = planToContent(plan);
    const result = applyContentUpdate(
      plan,
      {
        ...content,
        actionPlan: {
          ...content.actionPlan!,
          recommendedOperationalActions: [
            { ...content.actionPlan!.recommendedOperationalActions[0], action: "Reworded" },
            ...content.actionPlan!.recommendedOperationalActions.slice(1),
          ],
        },
      },
      { now: NOW, generatedAt: null, generation: null },
    );

    expect(result.ok && result.plan.actionPlan!.recommendedOperationalActions[0]).toMatchObject({
      claimType: "proposal",
      evidence: null,
      downgradeReason: "text_edited",
    });
  });
});

describe("case drift", () => {
  const edited = (plan: ReturnType<typeof makePlan>) => ({
    ...planToContent(plan),
    sustainabilityCase: {
      ...plan.sustainabilityCase,
      operationalContext: "A different situation entirely.",
    },
  });
  const sameWrite = { now: NOW, generatedAt: null, generation: null };

  it("is none until the case changes, then names what changed", () => {
    const plan = makePlan();
    const result = applyContentUpdate(plan, edited(plan), sameWrite);

    expect(getCaseDrift(plan)).toBe("none");
    expect(result.ok && getCaseDrift(result.plan)).toBe("drifted");
    expect(
      result.ok &&
        changedCaseFields(result.plan.generatedCase, result.plan.sustainabilityCase),
    ).toEqual(["Operational context"]);
  });

  it("blocks approval until acknowledged with a reason, and is reopened by a further edit", () => {
    const plan = makePlan();
    const drifted = applyContentUpdate(plan, edited(plan), sameWrite);

    if (!drifted.ok) {
      throw new Error("edit should be allowed");
    }

    expect(transitionPlan(drifted.plan, "approve", NOW)).toEqual({
      ok: false,
      error: "needs_reassessment",
    });
    expect(transitionPlan(drifted.plan, "acknowledge_drift", NOW)).toEqual({
      ok: false,
      error: "comment_required",
    });
    expect(transitionPlan(plan, "acknowledge_drift", NOW, { comment: "ok" })).toEqual({
      ok: false,
      error: "no_drift",
    });

    const acknowledged = transitionPlan(drifted.plan, "acknowledge_drift", NOW, {
      comment: "Context change is cosmetic.",
    });

    if (!acknowledged.ok) {
      throw new Error("acknowledgement should work");
    }

    expect(getCaseDrift(acknowledged.plan)).toBe("acknowledged");
    expect(transitionPlan(acknowledged.plan, "approve", NOW).ok).toBe(true);

    // Another change to the case reopens the question.
    const again = applyContentUpdate(
      acknowledged.plan,
      {
        ...planToContent(acknowledged.plan),
        sustainabilityCase: {
          ...acknowledged.plan.sustainabilityCase,
          issue: "Yet another change",
        },
      },
      sameWrite,
    );

    expect(again.ok && getCaseDrift(again.plan)).toBe("drifted");
  });

  it("does not apply to plans that were not generated", () => {
    const plan = { ...makePlan(), generatedCase: null };
    const result = applyContentUpdate(plan, edited(plan), sameWrite);

    expect(result.ok && getCaseDrift(result.plan)).toBe("none");
  });
});

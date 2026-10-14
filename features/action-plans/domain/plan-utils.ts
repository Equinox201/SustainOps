import type {
  AIActionPlan,
  GovernanceReview,
  StoredActionPlan,
  SustainabilityCaseInput,
} from "@/lib/types";
import type { ActionPlanSection, OverviewMetric } from "../types";

export function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `plan-${Date.now()}`;
}

export function getPlanTitle(input: SustainabilityCaseInput) {
  return `${input.department.trim()} — ${input.issue.trim()}`;
}

export function getVisibleStatus(
  plan: Pick<StoredActionPlan, "approved" | "completed">,
) {
  if (plan.completed) {
    return "Done";
  }

  if (plan.approved) {
    return "Active";
  }

  return "Pending Approval";
}

export function getReviewerStatus(
  approved: boolean,
  completed: boolean,
): GovernanceReview["reviewerStatus"] {
  if (completed || approved) {
    return "Approved";
  }

  return "Pending";
}

export function formatDate(value: string) {
  if (!value) {
    return "Not generated";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function hasCompleteCase(input: SustainabilityCaseInput) {
  return (
    input.property.trim().length > 0 &&
    input.department.trim().length > 0 &&
    input.issue.trim().length > 0 &&
    input.currentMetric.trim().length > 0 &&
    input.targetMetric.trim().length > 0 &&
    input.operationalContext.trim().length > 0
  );
}

export function trimCase(
  input: SustainabilityCaseInput,
): SustainabilityCaseInput {
  return {
    property: input.property.trim(),
    department: input.department.trim(),
    issue: input.issue.trim(),
    currentMetric: input.currentMetric.trim(),
    targetMetric: input.targetMetric.trim(),
    operationalContext: input.operationalContext.trim(),
  };
}

export function getActionPlanSections(
  actionPlan: AIActionPlan,
): ActionPlanSection[] {
  return [
    {
      title: "Situation Summary",
      body: actionPlan.situationSummary,
    },
    {
      title: "Likely Root Causes",
      items: actionPlan.likelyRootCauses,
    },
    {
      title: "Recommended Operational Actions",
      items: actionPlan.recommendedOperationalActions,
    },
    {
      title: "Staff Micro-Training Message",
      body: actionPlan.staffMicroTrainingMessage,
    },
    {
      title: "Manager Checklist",
      items: actionPlan.managerChecklist,
    },
    {
      title: "KPIs to Monitor",
      items: actionPlan.kpisToMonitor,
    },
    {
      title: "Governance & Privacy Notes",
      items: actionPlan.governancePrivacyNotes,
    },
    {
      title: "Follow-Up Recommendations",
      items: actionPlan.followUpRecommendations,
    },
  ];
}

export function copyActionPlan(plan: StoredActionPlan): StoredActionPlan {
  return {
    ...plan,
    sustainabilityCase: { ...plan.sustainabilityCase },
    actionPlan: plan.actionPlan
      ? {
          ...plan.actionPlan,
          likelyRootCauses: [...plan.actionPlan.likelyRootCauses],
          recommendedOperationalActions: [
            ...plan.actionPlan.recommendedOperationalActions,
          ],
          managerChecklist: [...plan.actionPlan.managerChecklist],
          kpisToMonitor: [...plan.actionPlan.kpisToMonitor],
          governancePrivacyNotes: [...plan.actionPlan.governancePrivacyNotes],
          followUpRecommendations: [
            ...plan.actionPlan.followUpRecommendations,
          ],
        }
      : null,
    governanceReview: { ...plan.governanceReview },
    readinessChecklist: { ...plan.readinessChecklist },
    kpiProgress: { ...plan.kpiProgress },
  };
}

export function getOperationalOverviewMetrics(plans: StoredActionPlan[]) {
  const pendingApproval = plans.filter(
    (plan) => !plan.approved && !plan.completed,
  ).length;
  const active = plans.filter(
    (plan) => plan.approved && !plan.completed,
  ).length;
  const done = plans.filter((plan) => plan.completed).length;
  const highPriority = plans.filter((plan) => plan.priority === "High").length;
  const upcomingReviews = plans.filter(
    (plan) => plan.nextReviewDate.trim().length > 0 && !plan.completed,
  ).length;

  return {
    metrics: [
      {
        label: "Total Plans",
        value: plans.length,
        helperText: "Stored in the database",
      },
      {
        label: "Pending Approval",
        value: pendingApproval,
        helperText: "Awaiting readiness review",
      },
      {
        label: "Active",
        value: active,
        helperText: "Approved and in progress",
      },
      {
        label: "Done",
        value: done,
        helperText: "Completed implementation",
      },
      {
        label: "High Priority",
        value: highPriority,
        helperText: "Requires closer follow-up",
      },
      {
        label: "Reviews Scheduled",
        value: upcomingReviews,
        helperText: "Review dates assigned",
      },
    ] satisfies OverviewMetric[],
    departments: Array.from(
      new Set(
        plans
          .map((plan) => plan.sustainabilityCase.department.trim())
          .filter(Boolean),
      ),
    ),
  };
}

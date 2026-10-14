import type {
  GovernanceReview,
  KPIProgress,
  ReadinessChecklist,
  StoredActionPlan,
  SustainabilityCaseInput,
} from "@/lib/types";
import { isAIActionPlan, isRecord } from "../domain/guards";

function isSustainabilityCaseInput(
  value: unknown,
): value is SustainabilityCaseInput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.property === "string" &&
    typeof value.department === "string" &&
    typeof value.issue === "string" &&
    typeof value.currentMetric === "string" &&
    typeof value.targetMetric === "string" &&
    typeof value.operationalContext === "string"
  );
}

function isGovernanceReview(value: unknown): value is GovernanceReview {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.humanReviewRequired === "boolean" &&
    typeof value.containsGuestPersonalData === "boolean" &&
    typeof value.approvedOperationalUse === "boolean" &&
    (value.reviewerStatus === "Pending" ||
      value.reviewerStatus === "Approved" ||
      value.reviewerStatus === "Needs Revision") &&
    typeof value.auditTimestamp === "string"
  );
}

function normalizePriority(value: unknown): StoredActionPlan["priority"] {
  if (value === "Low" || value === "Medium" || value === "High") {
    return value;
  }

  return "Medium";
}

function normalizeReadinessChecklist(value: unknown): ReadinessChecklist {
  const candidate = isRecord(value) ? value : {};

  return {
    actionsAreSpecific: candidate.actionsAreSpecific === true,
    kpisAreMeasurable: candidate.kpisAreMeasurable === true,
    ownerAssigned: candidate.ownerAssigned === true,
    timelineDefined: candidate.timelineDefined === true,
    privacyReviewed: candidate.privacyReviewed === true,
    staffMessageReady: candidate.staffMessageReady === true,
  };
}

function normalizeKpiProgress(value: unknown): KPIProgress {
  const candidate = isRecord(value) ? value : {};

  return {
    baseline:
      typeof candidate.baseline === "string" ? candidate.baseline : "",
    current: typeof candidate.current === "string" ? candidate.current : "",
    target: typeof candidate.target === "string" ? candidate.target : "",
    latestUpdate:
      typeof candidate.latestUpdate === "string"
        ? candidate.latestUpdate
        : "",
  };
}

export function normalizeStoredActionPlan(
  value: unknown,
): StoredActionPlan | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    !isSustainabilityCaseInput(value.sustainabilityCase) ||
    !(value.actionPlan === null || isAIActionPlan(value.actionPlan)) ||
    !isGovernanceReview(value.governanceReview) ||
    typeof value.approved !== "boolean" ||
    typeof value.completed !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    sustainabilityCase: value.sustainabilityCase,
    actionPlan: value.actionPlan,
    governanceReview: value.governanceReview,
    actionNotes: typeof value.actionNotes === "string" ? value.actionNotes : "",
    owner: typeof value.owner === "string" ? value.owner : "",
    priority: normalizePriority(value.priority),
    targetDate: typeof value.targetDate === "string" ? value.targetDate : "",
    nextReviewDate:
      typeof value.nextReviewDate === "string" ? value.nextReviewDate : "",
    readinessChecklist: normalizeReadinessChecklist(value.readinessChecklist),
    kpiProgress: normalizeKpiProgress(value.kpiProgress),
    approved: value.approved,
    completed: value.completed,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function normalizeStoredActionPlans(
  value: unknown,
): StoredActionPlan[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalizedPlans: StoredActionPlan[] = [];

  for (const plan of value) {
    const normalizedPlan = normalizeStoredActionPlan(plan);

    if (!normalizedPlan) {
      return null;
    }

    normalizedPlans.push(normalizedPlan);
  }

  return normalizedPlans;
}

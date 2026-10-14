import type { AIActionPlan } from "@/lib/types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isAIActionPlan(value: unknown): value is AIActionPlan {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.situationSummary === "string" &&
    Array.isArray(value.likelyRootCauses) &&
    Array.isArray(value.recommendedOperationalActions) &&
    typeof value.staffMicroTrainingMessage === "string" &&
    Array.isArray(value.managerChecklist) &&
    Array.isArray(value.kpisToMonitor) &&
    Array.isArray(value.governancePrivacyNotes) &&
    Array.isArray(value.followUpRecommendations) &&
    (value.confidenceLevel === "Low" ||
      value.confidenceLevel === "Medium" ||
      value.confidenceLevel === "High") &&
    typeof value.humanReviewRequired === "boolean"
  );
}

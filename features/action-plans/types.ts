import type {
  AIActionPlan,
  GovernanceReview,
  KPIProgress,
  ReadinessChecklist,
  StoredActionPlan,
  SustainabilityCaseInput,
} from "@/lib/types";

export type ActionPlanSection = {
  title: string;
  body?: string;
  items?: string[];
  /** Recommended actions, each with the sources that support it. */
  actions?: AIActionPlan["recommendedOperationalActions"];
};

export type EditorDraft = {
  id: string | null;
  sustainabilityCase: SustainabilityCaseInput;
  actionPlan: AIActionPlan | null;
  generationId: string | null;
  governanceReview: GovernanceReview;
  owner: string;
  priority: StoredActionPlan["priority"];
  targetDate: string;
  nextReviewDate: string;
  readinessChecklist: ReadinessChecklist;
  kpiProgress: KPIProgress;
  /** Version of the saved plan this draft was loaded from (null if unsaved). */
  version: number | null;
  /** The version a reviewer approved, if the plan is approved. */
  approvedVersion: number | null;
  /** The AI's output as first saved or last regenerated (read-only). */
  originalAiOutput: AIActionPlan | null;
  /** The case as the AI saw it (null if not generated). */
  generatedCase: StoredActionPlan["generatedCase"];
  driftAcknowledged: boolean;
  changeRequests: StoredActionPlan["changeRequests"];
  approved: boolean;
  completed: boolean;
  reviewStatus: StoredActionPlan["reviewStatus"];
  reviewComment: string | null;
  approvedBy: StoredActionPlan["approvedBy"];
  approvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type EditorPanel = "case" | "plan" | "kpi" | "notes" | "history";

export type MainView = "actionPlans" | "insights";

export type OverviewMetric = {
  label: string;
  value: number;
  helperText: string;
};

export type KnowledgeDocumentInfo = {
  id: string;
  slug: string;
  title: string;
  department: string;
  documentType: string;
  region: string;
  version: number;
  status: string;
  chunkCount: number;
};

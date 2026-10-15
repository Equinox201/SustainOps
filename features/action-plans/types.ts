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
  actionNotes: string;
  owner: string;
  priority: StoredActionPlan["priority"];
  targetDate: string;
  nextReviewDate: string;
  readinessChecklist: ReadinessChecklist;
  kpiProgress: KPIProgress;
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

export type KnowledgeSource = {
  title: string;
  type: string;
  status: string;
  use: string;
};

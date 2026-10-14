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
};

export type EditorDraft = {
  id: string | null;
  sustainabilityCase: SustainabilityCaseInput;
  actionPlan: AIActionPlan | null;
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
  createdAt: string | null;
};

export type EditorPanel = "case" | "plan" | "kpi" | "notes";

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

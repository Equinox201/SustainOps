import type {
  ActorRef,
  AIActionPlan,
  GovernanceReview,
  Grounding,
  KPIProgress,
  ModelActionPlan,
  PlanContent,
  Priority,
  ReadinessChecklist,
  RecommendedAction,
  SourceRef,
  SustainabilityCaseInput,
} from "@/lib/schemas/action-plan";

export type {
  ActorRef,
  AIActionPlan,
  GovernanceReview,
  Grounding,
  KPIProgress,
  ModelActionPlan,
  PlanContent,
  Priority,
  ReadinessChecklist,
  RecommendedAction,
  SourceRef,
  SustainabilityCaseInput,
};

export type AuditEventType =
  | "demo_cases_loaded"
  | "action_plan_created"
  | "action_plan_generated"
  | "action_plan_updated"
  | "action_plan_approved"
  | "changes_requested"
  | "approval_reset"
  | "action_plan_completed"
  | "action_plan_deleted"
  | "action_notes_updated"
  | "kpi_progress_updated";

export type AuditEvent = {
  id: string;
  eventType: AuditEventType;
  planId: string | null;
  department: string | null;
  actor: { id: string; name: string; role: string } | null;
  comment: string | null;
  createdAt: string;
};

export type StoredActionPlan = {
  id: string;
  title: string;
  sustainabilityCase: SustainabilityCaseInput;
  actionPlan: AIActionPlan | null;
  generationId: string | null;
  governanceReview: GovernanceReview;
  actionNotes: string;
  owner: string;
  priority: Priority;
  targetDate: string;
  nextReviewDate: string;
  readinessChecklist: ReadinessChecklist;
  kpiProgress: KPIProgress;
  approved: boolean;
  completed: boolean;
  reviewStatus: "none" | "changes_requested";
  reviewComment: string | null;
  createdBy: ActorRef | null;
  approvedBy: ActorRef | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

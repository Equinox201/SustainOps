import type {
  ActionOrigin,
  ActionStatus,
  ActorRef,
  AIActionPlan,
  ChangeRequest,
  ChangeResponse,
  GovernanceReview,
  Grounding,
  KPIProgress,
  ModelActionPlan,
  PlanContent,
  Priority,
  ReadinessChecklist,
  RecommendedAction,
  SourceRef,
  StoredAction,
  SustainabilityCaseInput,
} from "@/lib/schemas/action-plan";

export type {
  ActionOrigin,
  ActionStatus,
  ActorRef,
  AIActionPlan,
  ChangeRequest,
  ChangeResponse,
  GovernanceReview,
  Grounding,
  KPIProgress,
  ModelActionPlan,
  PlanContent,
  Priority,
  ReadinessChecklist,
  RecommendedAction,
  SourceRef,
  StoredAction,
  SustainabilityCaseInput,
};

export type AuditEventType =
  | "demo_cases_loaded"
  | "demo_reset"
  | "action_plan_created"
  | "action_plan_generated"
  | "action_plan_updated"
  | "action_plan_approved"
  | "changes_requested"
  | "approval_reset"
  | "action_plan_completed"
  | "action_plan_deleted"
  | "plan_resubmitted"
  | "note_added"
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
  owner: string;
  priority: Priority;
  targetDate: string;
  nextReviewDate: string;
  readinessChecklist: ReadinessChecklist;
  kpiProgress: KPIProgress;
  /** Concurrency token; sent back with every edit. */
  version: number;
  /** The version that was approved; null unless approved. */
  approvedVersion: number | null;
  /** The AI's output as first saved or last regenerated; never edited. */
  originalAiOutput: AIActionPlan | null;
  changeRequests: ChangeRequest[];
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

/** A free-text implementation note: append-only, attributed and timestamped. */
export type PlanNote = {
  id: string;
  body: string;
  author: { id: string; name: string; role: string } | null;
  createdAt: string;
};

/** The content of a plan as it stood at one version. */
export type RevisionSnapshot = {
  sustainabilityCase: SustainabilityCaseInput;
  actionPlan: AIActionPlan | null;
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
};

export type PlanRevisionSummary = {
  version: number;
  eventType: string;
  actor: { id: string; name: string; role: string } | null;
  reason: string | null;
  createdAt: string;
};

export type PlanRevision = PlanRevisionSummary & {
  snapshot: RevisionSnapshot;
};

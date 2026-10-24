import type {
  ActionOrigin,
  ActionStatus,
  ActorRef,
  AIActionPlan,
  CaseDrift,
  ChangeRequest,
  ChangeResponse,
  SourceAlert,
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
  CaseDrift,
  ChangeRequest,
  ChangeResponse,
  SourceAlert,
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
  | "knowledge_draft_saved"
  | "knowledge_published"
  | "knowledge_publish_failed"
  | "knowledge_withdrawn"
  | "drift_acknowledged"
  | "note_added"
  | "action_notes_updated"
  | "kpi_progress_updated";

/** Why a section of the knowledge base was, or was not, given to the model. */
export type RetrievalDecision =
  | "kept"
  | "below_floor"
  | "beyond_top_k"
  | "excluded_status"
  | "excluded_department"
  | "excluded_model";

export type RetrievalCandidate = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentVersion: number;
  documentStatus: string;
  department: string;
  sectionRef: string;
  heading: string;
  /** Similarity to the case; null when the vectors are not comparable. */
  score: number | null;
  decision: RetrievalDecision;
};

/** Everything retrieval considered for one generation, and what it decided. */
export type RetrievalDiagnostics = {
  query: string;
  embeddingModel: string;
  topK: number;
  minScore: number;
  caseDepartment: string;
  candidates: RetrievalCandidate[];
};

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
  /** Documents this plan cites that have since been superseded or withdrawn. */
  sourceAlerts: SourceAlert[];
  /** The case as the AI saw it; null if the plan was not generated. */
  generatedCase: SustainabilityCaseInput | null;
  /** Accepted despite the case changing since generation. */
  driftAcknowledged: boolean;
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

import { z } from "zod";

/**
 * Single source of truth for action-plan data shapes.
 * Used by API routes, the client, the database mapping and the OpenAI
 * structured-output schema, so they cannot drift apart.
 */

export const LIMITS = {
  property: 120,
  department: 80,
  issue: 300,
  metric: 300,
  operationalContext: 2000,
  owner: 120,
  kpiShort: 200,
  kpiUpdate: 2000,
  aiSummary: 1500,
  aiItem: 600,
  aiItems: 8,
  /** The model proposes at most `aiItems`; people may add a few more. */
  actionItems: 12,
  blockedReason: 300,
  note: 1000,
  changeResponse: 500,
} as const;

export const PRIORITIES = ["Low", "Medium", "High"] as const;
export const CONFIDENCE_LEVELS = ["Low", "Medium", "High"] as const;
export const ACTION_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "done",
] as const;
export const ACTION_ORIGINS = ["ai", "human"] as const;

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max);
const isoDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use YYYY-MM-DD");

export const sustainabilityCaseSchema = z.strictObject({
  property: requiredText(LIMITS.property),
  department: requiredText(LIMITS.department),
  issue: requiredText(LIMITS.issue),
  currentMetric: requiredText(LIMITS.metric),
  targetMetric: requiredText(LIMITS.metric),
  operationalContext: requiredText(LIMITS.operationalContext),
});

const aiList = z
  .array(z.string().trim().min(1).max(LIMITS.aiItem))
  .min(1)
  .max(LIMITS.aiItems);

/** Short alias the model uses to cite a retrieved source, e.g. "S1". */
export const sourceIdSchema = z.string().regex(/^S\d{1,2}$/);

/** What the model proposes: text and the sources it cites, nothing else. */
export const recommendedActionSchema = z.strictObject({
  action: requiredText(LIMITS.aiItem),
  // Only ids of sources supplied in the prompt are valid; the server checks.
  sourceIds: z.array(sourceIdSchema).max(4),
});

/**
 * An action as stored: the proposal plus an identity and its tracking state.
 * `origin` is decided by the server (see `normalizeActions`), never trusted
 * from the client.
 */
export const storedActionSchema = recommendedActionSchema.extend({
  id: z.uuid(),
  origin: z.enum(ACTION_ORIGINS),
  status: z.enum(ACTION_STATUSES),
  assigneeId: z.string().min(1).max(100).nullable(),
  dueDate: isoDate,
  blockedReason: optionalText(LIMITS.blockedReason),
});

/** What the model must return. Kept strict; human review is always required. */
export const modelActionPlanSchema = z.strictObject({
  situationSummary: requiredText(LIMITS.aiSummary),
  likelyRootCauses: aiList,
  recommendedOperationalActions: z
    .array(recommendedActionSchema)
    .min(1)
    .max(LIMITS.aiItems),
  staffMicroTrainingMessage: requiredText(LIMITS.aiSummary),
  managerChecklist: aiList,
  kpisToMonitor: aiList,
  governancePrivacyNotes: aiList,
  followUpRecommendations: aiList,
  confidenceLevel: z.enum(CONFIDENCE_LEVELS),
  humanReviewRequired: z.literal(true),
});

/** A retrieved source, frozen into the plan at generation time. */
export const sourceRefSchema = z.strictObject({
  id: sourceIdSchema,
  chunkId: z.uuid(),
  documentId: z.uuid(),
  documentTitle: z.string(),
  documentVersion: z.number().int(),
  documentType: z.string(),
  department: z.string(),
  sectionRef: z.string(),
  heading: z.string(),
  excerpt: z.string().max(1200),
  score: z.number(),
});

export const GROUNDING_STATUSES = [
  "grounded",
  "partial",
  "ungrounded",
] as const;

export const groundingSchema = z.strictObject({
  status: z.enum(GROUNDING_STATUSES),
  retrievedCount: z.number().int().min(0),
});

/**
 * The stored plan: the model's output plus what it was grounded on. The
 * server adds `sources` and `grounding`; the model never writes them.
 */
export const aiActionPlanSchema = modelActionPlanSchema
  .omit({ recommendedOperationalActions: true })
  .extend({
    recommendedOperationalActions: z
      .array(storedActionSchema)
      .min(1)
      .max(LIMITS.actionItems),
    sources: z.array(sourceRefSchema).max(12),
    grounding: groundingSchema,
  });

export const governanceReviewSchema = z.strictObject({
  humanReviewRequired: z.boolean(),
  containsGuestPersonalData: z.boolean(),
  approvedOperationalUse: z.boolean(),
  reviewerStatus: z.enum(["Pending", "Approved", "Needs Revision"]),
  auditTimestamp: z.string(),
});

export const readinessChecklistSchema = z.strictObject({
  actionsAreSpecific: z.boolean(),
  kpisAreMeasurable: z.boolean(),
  ownerAssigned: z.boolean(),
  timelineDefined: z.boolean(),
  privacyReviewed: z.boolean(),
  staffMessageReady: z.boolean(),
});

export const kpiProgressSchema = z.strictObject({
  baseline: optionalText(LIMITS.kpiShort),
  current: optionalText(LIMITS.kpiShort),
  target: optionalText(LIMITS.metric),
  latestUpdate: optionalText(LIMITS.kpiUpdate),
});

/**
 * What a client may send when saving a plan. Approval state, governance
 * review and timestamps are deliberately absent: the server owns them.
 */
export const planContentSchema = z.strictObject({
  sustainabilityCase: sustainabilityCaseSchema,
  actionPlan: aiActionPlanSchema.nullable(),
  generationId: z.uuid().nullable(),
  owner: optionalText(LIMITS.owner),
  priority: z.enum(PRIORITIES),
  targetDate: isoDate,
  nextReviewDate: isoDate,
  readinessChecklist: readinessChecklistSchema,
  kpiProgress: kpiProgressSchema,
});

export const generateRequestSchema = z.strictObject({
  sustainabilityCase: sustainabilityCaseSchema,
  planId: z.string().max(100).nullable().optional(),
});

/** Which version of the plan the caller was looking at when they edited it. */
export const expectedVersionSchema = z.number().int().min(1);

export const planUpdateSchema = planContentSchema.extend({
  expectedVersion: expectedVersionSchema,
});

export const actorRefSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  role: z.enum(["sustainability_manager", "department_manager", "reviewer"]),
});

/** The author's answer to one open change request, given on resubmission. */
export const changeResponseSchema = z.strictObject({
  requestId: z.uuid(),
  response: requiredText(LIMITS.changeResponse),
});

export const transitionRequestSchema = z.strictObject({
  event: z.enum([
    "approve",
    "request_changes",
    "resubmit",
    "complete",
    "reset_approval",
  ]),
  expectedVersion: expectedVersionSchema,
  content: planContentSchema.optional(),
  comment: z.string().trim().min(1).max(1000).optional(),
  responses: z.array(changeResponseSchema).max(20).optional(),
});

export const noteRequestSchema = z.strictObject({
  body: requiredText(LIMITS.note),
});

/** A reviewer's request for changes and, once given, the author's response. */
export const changeRequestSchema = z.strictObject({
  id: z.uuid(),
  comment: z.string(),
  status: z.enum(["open", "addressed"]),
  requestedBy: actorRefSchema,
  requestedAt: z.string(),
  response: z.string().nullable(),
  respondedBy: actorRefSchema.nullable(),
  respondedAt: z.string().nullable(),
});

export type SustainabilityCaseInput = z.infer<typeof sustainabilityCaseSchema>;
export type AIActionPlan = z.infer<typeof aiActionPlanSchema>;
export type ModelActionPlan = z.infer<typeof modelActionPlanSchema>;
export type RecommendedAction = z.infer<typeof recommendedActionSchema>;
export type SourceRef = z.infer<typeof sourceRefSchema>;
export type Grounding = z.infer<typeof groundingSchema>;
export type GovernanceReview = z.infer<typeof governanceReviewSchema>;
export type ReadinessChecklist = z.infer<typeof readinessChecklistSchema>;
export type KPIProgress = z.infer<typeof kpiProgressSchema>;
export type StoredAction = z.infer<typeof storedActionSchema>;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export type ActionOrigin = (typeof ACTION_ORIGINS)[number];
export type ChangeRequest = z.infer<typeof changeRequestSchema>;
export type ChangeResponse = z.infer<typeof changeResponseSchema>;
export type PlanContent = z.infer<typeof planContentSchema>;
export type Priority = (typeof PRIORITIES)[number];
export type ActorRef = z.infer<typeof actorRefSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** A plan as returned by the API: content plus server-owned fields. */
export const storedActionPlanSchema = planContentSchema.extend({
  id: z.string(),
  title: z.string(),
  governanceReview: governanceReviewSchema,
  version: expectedVersionSchema,
  /** The version that was approved; null unless the plan is approved. */
  approvedVersion: z.number().int().min(1).nullable(),
  /** The AI's output as first saved (or last regenerated). Never edited. */
  originalAiOutput: aiActionPlanSchema.nullable(),
  changeRequests: z.array(changeRequestSchema),
  approved: z.boolean(),
  completed: z.boolean(),
  reviewStatus: z.enum(["none", "changes_requested"]),
  reviewComment: z.string().nullable(),
  createdBy: actorRefSchema.nullable(),
  approvedBy: actorRefSchema.nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const generationResponseSchema = z.object({
  actionPlan: aiActionPlanSchema,
  generation: z.object({
    id: z.uuid(),
    model: z.string(),
    promptVersion: z.string(),
    generatedAt: z.string(),
    latencyMs: z.number(),
  }),
});

export const auditEventSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  planId: z.string().nullable(),
  department: z.string().nullable(),
  actor: z
    .object({ id: z.string(), name: z.string(), role: z.string() })
    .nullable(),
  comment: z.string().nullable(),
  createdAt: z.string(),
});

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["sustainability_manager", "department_manager", "reviewer"]),
  department: z.string().nullable(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

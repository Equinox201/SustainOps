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
  actionNotes: 5000,
  kpiShort: 200,
  kpiUpdate: 2000,
  aiSummary: 1500,
  aiItem: 600,
  aiItems: 8,
} as const;

export const PRIORITIES = ["Low", "Medium", "High"] as const;
export const CONFIDENCE_LEVELS = ["Low", "Medium", "High"] as const;

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

/** What the model must return. Kept strict; human review is always required. */
export const aiActionPlanSchema = z.strictObject({
  situationSummary: requiredText(LIMITS.aiSummary),
  likelyRootCauses: aiList,
  recommendedOperationalActions: aiList,
  staffMicroTrainingMessage: requiredText(LIMITS.aiSummary),
  managerChecklist: aiList,
  kpisToMonitor: aiList,
  governancePrivacyNotes: aiList,
  followUpRecommendations: aiList,
  confidenceLevel: z.enum(CONFIDENCE_LEVELS),
  humanReviewRequired: z.literal(true),
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
  actionNotes: optionalText(LIMITS.actionNotes),
});

export const generateRequestSchema = z.strictObject({
  sustainabilityCase: sustainabilityCaseSchema,
  planId: z.string().max(100).nullable().optional(),
});

export const transitionRequestSchema = z.strictObject({
  event: z.enum(["approve", "complete", "reset_approval"]),
  content: planContentSchema.optional(),
});

export type SustainabilityCaseInput = z.infer<typeof sustainabilityCaseSchema>;
export type AIActionPlan = z.infer<typeof aiActionPlanSchema>;
export type GovernanceReview = z.infer<typeof governanceReviewSchema>;
export type ReadinessChecklist = z.infer<typeof readinessChecklistSchema>;
export type KPIProgress = z.infer<typeof kpiProgressSchema>;
export type PlanContent = z.infer<typeof planContentSchema>;
export type Priority = (typeof PRIORITIES)[number];

/** A plan as returned by the API: content plus server-owned fields. */
export const storedActionPlanSchema = planContentSchema.extend({
  id: z.string(),
  title: z.string(),
  governanceReview: governanceReviewSchema,
  approved: z.boolean(),
  completed: z.boolean(),
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
  createdAt: z.string(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

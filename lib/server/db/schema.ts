import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  AIActionPlan,
  KPIProgress,
  ReadinessChecklist,
} from "@/lib/schemas/action-plan";
import type {
  RetrievalDiagnostics,
  RevisionSnapshot,
  SustainabilityCaseInput,
} from "@/lib/types";

/**
 * All tables have Row Level Security enabled with no policies: they are not
 * reachable through Supabase's public Data API. Only the server, connecting
 * with the database role, reads and writes them.
 */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").notNull(),
    department: text("department"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "users_role_check",
      sql`${table.role} in ('sustainability_manager', 'department_manager', 'reviewer')`,
    ),
    // Department managers are scoped to a department.
    check(
      "users_department_manager_has_department",
      sql`${table.role} <> 'department_manager' or ${table.department} is not null`,
    ),
  ],
).enableRLS();

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: text("request_id").notNull(),
    clientKey: text("client_key").notNull(),
    planId: text("plan_id"),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").notNull().default("pending"),
    errorCode: text("error_code"),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    // What the plan was grounded on, as retrieved for this generation.
    sources: jsonb("sources").$type<unknown[]>(),
    // The case the model was given, and the finished plan the server kept.
    // A plan saved from this generation must equal `output`, which is how
    // the server knows what is the AI's and what is a person's.
    input: jsonb("input").$type<SustainabilityCaseInput>(),
    output: jsonb("output").$type<AIActionPlan>(),
    // Every section retrieval considered, with the decision it reached.
    diagnostics: jsonb("diagnostics").$type<RetrievalDiagnostics>(),
    // Statements the model called policy requirements, and how many survived
    // the server's quotation check.
    policyClaims: integer("policy_claims").notNull().default(0),
    policyClaimsVerified: integer("policy_claims_verified")
      .notNull()
      .default(0),
    groundingStatus: text("grounding_status"),
    citationsDropped: integer("citations_dropped").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_generations_client_created_idx").on(
      table.clientKey,
      table.createdAt,
    ),
    index("ai_generations_created_idx").on(table.createdAt),
    check(
      "ai_generations_status_check",
      sql`${table.status} in ('pending', 'succeeded', 'failed')`,
    ),
  ],
).enableRLS();

export const actionPlans = pgTable(
  "action_plans",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    property: text("property").notNull(),
    department: text("department").notNull(),
    issue: text("issue").notNull(),
    currentMetric: text("current_metric").notNull(),
    targetMetric: text("target_metric").notNull(),
    operationalContext: text("operational_context").notNull(),
    actionPlan: jsonb("action_plan").$type<AIActionPlan>(),
    generationId: uuid("generation_id").references(() => aiGenerations.id, {
      onDelete: "set null",
    }),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    owner: text("owner").notNull().default(""),
    priority: text("priority").notNull().default("Medium"),
    targetDate: date("target_date", { mode: "string" }),
    nextReviewDate: date("next_review_date", { mode: "string" }),
    readinessChecklist: jsonb("readiness_checklist")
      .$type<ReadinessChecklist>()
      .notNull(),
    kpiProgress: jsonb("kpi_progress").$type<KPIProgress>().notNull(),
    // Deprecated: notes are rows in plan_notes. Kept (read-only, copied by
    // migration 0006) so the old value is not destroyed; drop it once the
    // new model has settled.
    actionNotes: text("action_notes").notNull().default(""),
    // The AI's output as first saved, or as last regenerated. Never edited:
    // human changes are measured against it.
    originalAiOutput: jsonb("original_ai_output").$type<AIActionPlan>(),
    // The version in which the current approval took effect.
    approvedVersion: integer("approved_version"),
    // The case as the AI saw it: the plan is stale if the case has changed.
    generatedCase: jsonb("generated_case").$type<SustainabilityCaseInput>(),
    driftAcknowledged: boolean("drift_acknowledged").notNull().default(false),
    approved: boolean("approved").notNull().default(false),
    completed: boolean("completed").notNull().default(false),
    // Optimistic concurrency token: bumped on every successful write.
    version: integer("version").notNull().default(1),
    reviewStatus: text("review_status").notNull().default("none"),
    reviewComment: text("review_comment"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedBy: text("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("action_plans_created_idx").on(table.createdAt),
    check(
      "action_plans_review_status_check",
      sql`${table.reviewStatus} in ('none', 'changes_requested')`,
    ),
    check(
      "action_plans_priority_check",
      sql`${table.priority} in ('Low', 'Medium', 'High')`,
    ),
    // A plan cannot be completed without having been approved.
    check(
      "action_plans_completed_requires_approved",
      sql`not ${table.completed} or ${table.approved}`,
    ),
  ],
).enableRLS();

/**
 * One immutable snapshot per version of a plan, written in the same
 * transaction as the change. `approved_version` points at the one a reviewer
 * actually approved.
 */
export const actionPlanRevisions = pgTable(
  "action_plan_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: text("plan_id")
      .notNull()
      .references(() => actionPlans.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    eventType: text("event_type").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorRole: text("actor_role"),
    reason: text("reason"),
    snapshot: jsonb("snapshot").$type<RevisionSnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("action_plan_revisions_plan_version_idx").on(
      table.planId,
      table.version,
    ),
  ],
).enableRLS();

/**
 * A reviewer's request for changes. It stays open until the author answers it
 * explicitly when resubmitting; editing the plan does not close it.
 */
export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: text("plan_id")
      .notNull()
      .references(() => actionPlans.id, { onDelete: "cascade" }),
    comment: text("comment").notNull(),
    status: text("status").notNull().default("open"),
    requestedBy: text("requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    response: text("response"),
    respondedBy: text("responded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    index("change_requests_plan_idx").on(table.planId, table.requestedAt),
    check(
      "change_requests_status_check",
      sql`${table.status} in ('open', 'addressed')`,
    ),
    check(
      "change_requests_addressed_has_response",
      sql`${table.status} <> 'addressed' or (${table.response} is not null and ${table.respondedAt} is not null)`,
    ),
  ],
).enableRLS();

/** Implementation notes: append-only, attributed and timestamped. */
export const planNotes = pgTable(
  "plan_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: text("plan_id")
      .notNull()
      .references(() => actionPlans.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorUserId: text("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorRole: text("author_role"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("plan_notes_plan_idx").on(table.planId, table.createdAt)],
).enableRLS();

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Not a foreign key on purpose: history must outlive a deleted plan.
    planId: text("plan_id"),
    eventType: text("event_type").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Role at the time of the event, so history stays accurate if roles change.
    actorRole: text("actor_role"),
    department: text("department"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_plan_created_idx").on(table.planId, table.createdAt),
    index("audit_events_created_idx").on(table.createdAt),
  ],
).enableRLS();

/**
 * Approved company knowledge. Only documents with status "approved" are ever
 * retrieved; older versions are kept as "superseded" for the record.
 */
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    department: text("department").notNull(),
    documentType: text("document_type").notNull(),
    region: text("region").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("knowledge_documents_status_dept_idx").on(
      table.status,
      table.department,
    ),
    check(
      "knowledge_documents_status_check",
      sql`${table.status} in ('approved', 'draft', 'superseded')`,
    ),
  ],
).enableRLS();

export const EMBEDDING_DIMENSIONS = 1536;

/** One numbered section of a document: the unit of retrieval and citation. */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    sectionRef: text("section_ref").notNull(),
    heading: text("heading").notNull(),
    content: text("content").notNull(),
    // Chunks are only compared to vectors made by the same embedding model.
    embeddingModel: text("embedding_model").notNull(),
    embedding: vector("embedding", {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("knowledge_chunks_document_idx").on(table.documentId, table.ordinal),
  ],
).enableRLS();

export type ActionPlanRow = typeof actionPlans.$inferSelect;
export type ChangeRequestRow = typeof changeRequests.$inferSelect;
export type PlanNoteRow = typeof planNotes.$inferSelect;
export type RevisionRow = typeof actionPlanRevisions.$inferSelect;

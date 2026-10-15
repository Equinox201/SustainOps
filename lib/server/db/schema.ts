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
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  AIActionPlan,
  KPIProgress,
  ReadinessChecklist,
} from "@/lib/schemas/action-plan";

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
    actionNotes: text("action_notes").notNull().default(""),
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
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("knowledge_chunks_document_idx").on(table.documentId, table.ordinal),
  ],
).enableRLS();

export type ActionPlanRow = typeof actionPlans.$inferSelect;

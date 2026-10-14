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

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: text("request_id").notNull(),
    clientKey: text("client_key").notNull(),
    planId: text("plan_id"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").notNull().default("pending"),
    errorCode: text("error_code"),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
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

export type ActionPlanRow = typeof actionPlans.$inferSelect;

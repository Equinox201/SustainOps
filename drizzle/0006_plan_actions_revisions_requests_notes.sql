CREATE TABLE "action_plan_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" text,
	"actor_role" text,
	"reason" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_plan_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"comment" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requested_by" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"response" text,
	"responded_by" text,
	"responded_at" timestamp with time zone,
	CONSTRAINT "change_requests_status_check" CHECK ("change_requests"."status" in ('open', 'addressed')),
	CONSTRAINT "change_requests_addressed_has_response" CHECK ("change_requests"."status" <> 'addressed' or ("change_requests"."response" is not null and "change_requests"."responded_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "change_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"body" text NOT NULL,
	"author_user_id" text,
	"author_role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "action_plans" ADD COLUMN "original_ai_output" jsonb;--> statement-breakpoint
ALTER TABLE "action_plans" ADD COLUMN "approved_version" integer;--> statement-breakpoint
ALTER TABLE "action_plan_revisions" ADD CONSTRAINT "action_plan_revisions_plan_id_action_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."action_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plan_revisions" ADD CONSTRAINT "action_plan_revisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_plan_id_action_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."action_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_notes" ADD CONSTRAINT "plan_notes_plan_id_action_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."action_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_notes" ADD CONSTRAINT "plan_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_plan_revisions_plan_version_idx" ON "action_plan_revisions" USING btree ("plan_id","version");--> statement-breakpoint
CREATE INDEX "change_requests_plan_idx" ON "change_requests" USING btree ("plan_id","requested_at");--> statement-breakpoint
CREATE INDEX "plan_notes_plan_idx" ON "plan_notes" USING btree ("plan_id","created_at");--> statement-breakpoint
-- Data migration. Existing plans gain what the new model needs.
-- 1. Every action gets a stable id and tracking fields (origin "ai": it was generated).
UPDATE "action_plans"
SET "action_plan" = "action_plan" || jsonb_build_object(
  'recommendedOperationalActions',
  (
    SELECT coalesce(jsonb_agg(
      CASE
        WHEN elem ? 'id' THEN elem
        ELSE elem || jsonb_build_object(
          'id', gen_random_uuid()::text,
          'origin', 'ai',
          'status', 'open',
          'assigneeId', NULL,
          'dueDate', '',
          'blockedReason', ''
        )
      END
      ORDER BY ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements("action_plan"->'recommendedOperationalActions')
      WITH ORDINALITY AS t(elem, ord)
  )
)
WHERE "action_plan" IS NOT NULL
  AND jsonb_typeof("action_plan"->'recommendedOperationalActions') = 'array';
--> statement-breakpoint
-- 2. The baseline against which human edits are measured.
UPDATE "action_plans"
SET "original_ai_output" = "action_plan"
WHERE "action_plan" IS NOT NULL AND "original_ai_output" IS NULL;
--> statement-breakpoint
-- 3. Plans that are approved right now were approved at their current version.
UPDATE "action_plans"
SET "approved_version" = "version"
WHERE "approved" AND "approved_version" IS NULL;
--> statement-breakpoint
-- 4. A first revision per plan, so history and comparison start from today.
INSERT INTO "action_plan_revisions"
  ("plan_id", "version", "event_type", "reason", "snapshot", "created_at")
SELECT
  p."id",
  p."version",
  'migrated',
  'Snapshot taken when revision history was introduced.',
  jsonb_build_object(
    'sustainabilityCase', jsonb_build_object(
      'property', p."property",
      'department', p."department",
      'issue', p."issue",
      'currentMetric', p."current_metric",
      'targetMetric', p."target_metric",
      'operationalContext', p."operational_context"
    ),
    'actionPlan', p."action_plan",
    'owner', p."owner",
    'priority', p."priority",
    'targetDate', coalesce(to_char(p."target_date", 'YYYY-MM-DD'), ''),
    'nextReviewDate', coalesce(to_char(p."next_review_date", 'YYYY-MM-DD'), ''),
    'readinessChecklist', p."readiness_checklist",
    'kpiProgress', p."kpi_progress",
    'approved', p."approved",
    'completed', p."completed",
    'reviewStatus', p."review_status",
    'reviewComment', p."review_comment"
  ),
  p."updated_at"
FROM "action_plans" p
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 5. The old single notes field becomes the first attributed-less note.
INSERT INTO "plan_notes" ("plan_id", "body", "created_at")
SELECT "id", "action_notes", "updated_at"
FROM "action_plans"
WHERE btrim("action_notes") <> '';
--> statement-breakpoint
-- 6. An outstanding change request becomes an open request row.
INSERT INTO "change_requests" ("plan_id", "comment", "status", "requested_at")
SELECT "id", "review_comment", 'open', "updated_at"
FROM "action_plans"
WHERE "review_status" = 'changes_requested' AND "review_comment" IS NOT NULL;

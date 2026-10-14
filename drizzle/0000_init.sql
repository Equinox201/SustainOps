CREATE TABLE "action_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"property" text NOT NULL,
	"department" text NOT NULL,
	"issue" text NOT NULL,
	"current_metric" text NOT NULL,
	"target_metric" text NOT NULL,
	"operational_context" text NOT NULL,
	"action_plan" jsonb,
	"generation_id" uuid,
	"generated_at" timestamp with time zone,
	"owner" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"target_date" date,
	"next_review_date" date,
	"readiness_checklist" jsonb NOT NULL,
	"kpi_progress" jsonb NOT NULL,
	"action_notes" text DEFAULT '' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_plans_priority_check" CHECK ("action_plans"."priority" in ('Low', 'Medium', 'High')),
	CONSTRAINT "action_plans_completed_requires_approved" CHECK (not "action_plans"."completed" or "action_plans"."approved")
);
--> statement-breakpoint
ALTER TABLE "action_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"client_key" text NOT NULL,
	"plan_id" text,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_generations_status_check" CHECK ("ai_generations"."status" in ('pending', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "ai_generations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text,
	"event_type" text NOT NULL,
	"department" text,
	"metadata" jsonb,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_plans_created_idx" ON "action_plans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_generations_client_created_idx" ON "ai_generations" USING btree ("client_key","created_at");--> statement-breakpoint
CREATE INDEX "ai_generations_created_idx" ON "ai_generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_plan_created_idx" ON "audit_events" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");
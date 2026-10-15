CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"department" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('sustainability_manager', 'department_manager', 'reviewer')),
	CONSTRAINT "users_department_manager_has_department" CHECK ("users"."role" <> 'department_manager' or "users"."department" is not null)
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "action_plans" ADD COLUMN "review_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "action_plans" ADD COLUMN "review_comment" text;--> statement-breakpoint
ALTER TABLE "action_plans" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "action_plans" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "action_plans" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_user_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_role" text;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_review_status_check" CHECK ("action_plans"."review_status" in ('none', 'changes_requested'));
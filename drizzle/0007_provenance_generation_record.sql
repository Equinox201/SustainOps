ALTER TABLE "action_plans" ADD COLUMN "generated_case" jsonb;--> statement-breakpoint
ALTER TABLE "action_plans" ADD COLUMN "drift_acknowledged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "input" jsonb;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "output" jsonb;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "diagnostics" jsonb;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "policy_claims" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "policy_claims_verified" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Data migration. Actions stored before claims were recorded are marked
-- "unclassified" rather than guessed at.
UPDATE "action_plans"
SET "action_plan" = "action_plan" || jsonb_build_object(
  'recommendedOperationalActions',
  (
    SELECT coalesce(jsonb_agg(
      CASE WHEN elem ? 'claimType' THEN elem
      ELSE elem || jsonb_build_object(
        'claimType', 'unclassified',
        'evidence', NULL,
        'downgradeReason', NULL
      ) END
      ORDER BY ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements("action_plan"->'recommendedOperationalActions')
      WITH ORDINALITY AS t(elem, ord)
  )
)
WHERE "action_plan" IS NOT NULL
  AND jsonb_typeof("action_plan"->'recommendedOperationalActions') = 'array';
--> statement-breakpoint
UPDATE "action_plans"
SET "original_ai_output" = "original_ai_output" || jsonb_build_object(
  'recommendedOperationalActions',
  (
    SELECT coalesce(jsonb_agg(
      CASE WHEN elem ? 'claimType' THEN elem
      ELSE elem || jsonb_build_object(
        'claimType', 'unclassified',
        'evidence', NULL,
        'downgradeReason', NULL
      ) END
      ORDER BY ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements("original_ai_output"->'recommendedOperationalActions')
      WITH ORDINALITY AS t(elem, ord)
  )
)
WHERE "original_ai_output" IS NOT NULL
  AND jsonb_typeof("original_ai_output"->'recommendedOperationalActions') = 'array';
--> statement-breakpoint
-- Existing generated plans start with no drift: the case as it stands is the
-- case they were generated from, as far as anyone can now know.
UPDATE "action_plans"
SET "generated_case" = jsonb_build_object(
  'property', "property",
  'department', "department",
  'issue', "issue",
  'currentMetric', "current_metric",
  'targetMetric', "target_metric",
  'operationalContext', "operational_context"
)
WHERE "action_plan" IS NOT NULL AND "generated_case" IS NULL;

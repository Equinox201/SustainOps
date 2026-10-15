-- Upgrade stored plans to the grounded shape:
--   recommendedOperationalActions: string[]  ->  {action, sourceIds}[]
--   adds sources: [] and grounding: {status, retrievedCount}
-- Existing plans were generated without retrieval, so they are "ungrounded".
UPDATE "action_plans"
SET "action_plan" = "action_plan" || jsonb_build_object(
  'recommendedOperationalActions',
  (
    SELECT coalesce(
      jsonb_agg(
        CASE
          WHEN jsonb_typeof(elem) = 'string'
            THEN jsonb_build_object('action', elem, 'sourceIds', '[]'::jsonb)
          ELSE elem
        END
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements("action_plan"->'recommendedOperationalActions') AS elem
  ),
  'sources', '[]'::jsonb,
  'grounding', jsonb_build_object('status', 'ungrounded', 'retrievedCount', 0)
)
WHERE "action_plan" IS NOT NULL
  AND jsonb_typeof("action_plan"->'recommendedOperationalActions') = 'array'
  AND NOT ("action_plan" ? 'grounding');

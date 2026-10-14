import { generateRequestSchema } from "@/lib/schemas/action-plan";
import { parseBody, json, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import { getEnv } from "@/lib/server/env";
import { generateActionPlan, getClientKey } from "@/lib/server/generation";

export const POST = withApi(async (request, { requestId }) => {
  const { sustainabilityCase, planId } = await parseBody(
    request,
    generateRequestSchema,
  );
  const env = getEnv();

  const result = await generateActionPlan({
    db: getDb(),
    env,
    input: sustainabilityCase,
    planId: planId ?? null,
    clientKey: getClientKey(request, env.RATE_LIMIT_SALT),
    requestId,
  });

  return json(result);
});

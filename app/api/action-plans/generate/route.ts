import { generateRequestSchema } from "@/lib/schemas/action-plan";
import { can } from "@/features/action-plans/domain/permissions";
import { ApiError, parseBody, json, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import { getEnv } from "@/lib/server/env";
import { getEmbedder } from "@/lib/server/embeddings";
import { generateActionPlan, getClientKey } from "@/lib/server/generation";
import { requirePrincipal } from "@/lib/server/session";

export const POST = withApi(async (request, { requestId }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);

  if (!can(actor, "plan:generate")) {
    throw new ApiError(
      403,
      "forbidden",
      "Your role is not allowed to generate action plans.",
      { permission: "plan:generate" },
    );
  }

  const { sustainabilityCase, planId } = await parseBody(
    request,
    generateRequestSchema,
  );
  const env = getEnv();

  const result = await generateActionPlan({
    db,
    env,
    input: sustainabilityCase,
    planId: planId ?? null,
    actor,
    getEmbedder: () => getEmbedder(env),
    clientKey: getClientKey(actor, env.RATE_LIMIT_SALT),
    requestId,
  });

  return json(result);
});

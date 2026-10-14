import { transitionRequestSchema } from "@/lib/schemas/action-plan";
import { parseBody, json, withApi } from "@/lib/server/api";
import { transitionPlanState } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";

type Params = { id: string };

/** Approve, complete or reset a plan, optionally saving pending edits first. */
export const POST = withApi<Params>(async (request, { requestId, params }) => {
  const { event, content } = await parseBody(request, transitionRequestSchema);
  const plan = await transitionPlanState(
    getDb(),
    params.id,
    event,
    content,
    { requestId },
  );

  return json({ plan });
});

import { transitionRequestSchema } from "@/lib/schemas/action-plan";
import { parseBody, json, withApi } from "@/lib/server/api";
import { transitionPlanState } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { requirePrincipal } from "@/lib/server/session";

type Params = { id: string };

/**
 * Approve, request changes, resubmit, complete or reset a plan, optionally
 * saving pending edits in the same transaction. Permissions depend on the event.
 */
export const POST = withApi<Params>(async (request, { requestId, params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const { event, expectedVersion, content, comment, responses } =
    await parseBody(request, transitionRequestSchema);
  const plan = await transitionPlanState(
    db,
    params.id,
    event,
    { expectedVersion, content, comment, responses },
    { requestId, actor },
  );

  return json({ plan });
});

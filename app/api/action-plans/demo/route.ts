import { demoActionPlans } from "@/lib/demo-plans";
import { json, withApi } from "@/lib/server/api";
import { listPlans, seedDemoPlans } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { requirePrincipal } from "@/lib/server/session";

/** Adds the fictional demo plans that are not already present. */
export const POST = withApi(async (request, { requestId }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const added = await seedDemoPlans(db, demoActionPlans, { requestId, actor });

  return json({ added, plans: await listPlans(db, actor) });
});

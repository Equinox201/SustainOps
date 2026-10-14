import { demoActionPlans } from "@/lib/demo-plans";
import { json, withApi } from "@/lib/server/api";
import { listPlans, seedDemoPlans } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";

/** Adds the fictional demo plans that are not already present. */
export const POST = withApi(async (_request, { requestId }) => {
  const db = getDb();
  const added = await seedDemoPlans(db, demoActionPlans, { requestId });
  const plans = await listPlans(db);

  return json({ added, plans });
});

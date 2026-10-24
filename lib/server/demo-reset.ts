import { replaceDemoPlans } from "./action-plan-repo";
import type { Database } from "./db";
import { buildGroundedDemoPlans } from "./demo-seed";
import { resetKnowledgeBase } from "./knowledge-admin";

/**
 * Returns the whole demo to its fictional starting state. The knowledge base
 * is restored first, because the demo plans are built from the documents in
 * it: a visitor who superseded or withdrew a shipped document must not leave
 * the demo plans citing something that is no longer approved.
 */
export async function resetDemoData(
  db: Database,
  options: Parameters<typeof replaceDemoPlans>[2],
) {
  const knowledge = await resetKnowledgeBase(db);
  const plans = await replaceDemoPlans(
    db,
    await buildGroundedDemoPlans(db),
    options,
  );

  return { ...plans, knowledgeRemoved: knowledge.removed, knowledgeRestored: knowledge.restored };
}

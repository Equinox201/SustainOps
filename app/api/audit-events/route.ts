import { json, withApi } from "@/lib/server/api";
import { listAuditEvents } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { requirePrincipal } from "@/lib/server/session";

export const GET = withApi(async (request) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);

  return json({ events: await listAuditEvents(db, actor) });
});

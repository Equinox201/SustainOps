import { json, withApi } from "@/lib/server/api";
import { listAuditEvents } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";

export const GET = withApi(async () => {
  const events = await listAuditEvents(getDb());
  return json({ events });
});

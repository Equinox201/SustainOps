import { json, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import { getSessionPrincipal } from "@/lib/server/session";

export const GET = withApi(async (request) => {
  const user = await getSessionPrincipal(request, getDb());
  return json({ user });
});

import { ApiError, json, withApi } from "@/lib/server/api";
import { getRevision } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { requirePrincipal } from "@/lib/server/session";

type Params = { id: string; version: string };

/** One version of a plan, with its content, for comparison. */
export const GET = withApi<Params>(async (request, { params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const version = Number(params.version);

  if (!Number.isInteger(version) || version < 1) {
    throw new ApiError(
      400,
      "invalid_version",
      "Version must be a positive integer.",
    );
  }

  return json({ revision: await getRevision(db, params.id, version, actor) });
});

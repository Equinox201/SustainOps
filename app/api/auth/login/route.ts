import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, json, parseBody, withApi } from "@/lib/server/api";
import { getDb, schema } from "@/lib/server/db";
import { createSessionCookie, toPrincipal } from "@/lib/server/session";

const loginSchema = z.strictObject({ userId: z.string().min(1).max(100) });

export const POST = withApi(async (request) => {
  const { userId } = await parseBody(request, loginSchema);
  const [row] = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  if (!row) {
    throw new ApiError(404, "unknown_user", "That demo user does not exist.");
  }

  return json({ user: toPrincipal(row) }, 200, {
    "set-cookie": await createSessionCookie(row.id),
  });
});

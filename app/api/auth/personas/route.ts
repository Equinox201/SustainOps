import { json, withApi } from "@/lib/server/api";
import { getDb, schema } from "@/lib/server/db";

/** The fictional demo personas offered on the sign-in screen. */
export const GET = withApi(async () => {
  const rows = await getDb().select().from(schema.users);

  return json({
    personas: rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        department: row.department,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
});

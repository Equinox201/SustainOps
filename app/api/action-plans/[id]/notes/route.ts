import { noteRequestSchema } from "@/lib/schemas/action-plan";
import { json, parseBody, withApi } from "@/lib/server/api";
import { addNote, listNotes } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { requirePrincipal } from "@/lib/server/session";

type Params = { id: string };

export const GET = withApi<Params>(async (request, { params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);

  return json({ notes: await listNotes(db, params.id, actor) });
});

/** Appends a note. Notes are attributed, timestamped and never edited. */
export const POST = withApi<Params>(async (request, { requestId, params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const { body } = await parseBody(request, noteRequestSchema);
  const note = await addNote(db, params.id, body, { requestId, actor });

  return json({ note }, 201);
});

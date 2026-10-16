import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { describe, expect, it } from "vitest";

// Applies migrations 0000-0005, inserts plans in the shape production had
// before this change, then applies 0006 and checks what the backfill did.
const dir = path.join(process.cwd(), "drizzle");

function sqlOf(prefix: string) {
  const file = fs.readdirSync(dir).find((name) => name.startsWith(prefix));

  if (!file) {
    throw new Error(`migration ${prefix} not found`);
  }

  return fs.readFileSync(path.join(dir, file), "utf8");
}

const legacyPlan = (id: string, extra: string, notes = "", review = "none") => `
  insert into action_plans
    (id, title, property, department, issue, current_metric, target_metric,
     operational_context, action_plan, readiness_checklist, kpi_progress,
     action_notes, review_status, review_comment, approved, version,
     target_date)
  values
    ('${id}', 'Title ${id}', 'Harbour House', 'Engineering', 'Issue', 'Now',
     'Target', 'Context',
     '${JSON.stringify({
       situationSummary: "s",
       recommendedOperationalActions: [
         { action: "First", sourceIds: ["S1"] },
         { action: "Second", sourceIds: [] },
       ],
       sources: [],
       grounding: { status: "ungrounded", retrievedCount: 0 },
     })}'::jsonb,
     '{"ownerAssigned":true}'::jsonb,
     '{"baseline":"","current":"","target":"","latestUpdate":""}'::jsonb,
     '${notes}', '${review}', ${review === "changes_requested" ? "'Add a KPI.'" : "null"},
     ${extra});`;

describe("migration 0006 on existing data", () => {
  it("backfills identities, baselines, revisions, notes and open requests", async () => {
    const client = new PGlite({ extensions: { vector } });

    for (const prefix of ["0000", "0001", "0002", "0003", "0004", "0005"]) {
      await client.exec(sqlOf(prefix));
    }

    await client.exec(
      legacyPlan("p-approved", "true, 4, '2026-12-01'", "Old note"),
    );
    await client.exec(
      legacyPlan("p-requested", "false, 2, null", "", "changes_requested"),
    );
    await client.exec(
      "insert into action_plans (id,title,property,department,issue,current_metric,target_metric,operational_context,readiness_checklist,kpi_progress) values ('p-empty','t','p','d','i','c','t','o','{}'::jsonb,'{}'::jsonb)",
    );

    await client.exec(sqlOf("0006"));

    const plans = await client.query<{
      id: string;
      action_plan: {
        recommendedOperationalActions: Record<string, unknown>[];
      } | null;
      original_ai_output: unknown;
      approved_version: number | null;
    }>(
      "select id, action_plan, original_ai_output, approved_version from action_plans order by id",
    );
    const byId = Object.fromEntries(plans.rows.map((row) => [row.id, row]));

    // Every action has an id and tracking fields; order is preserved.
    const actions =
      byId["p-approved"].action_plan!.recommendedOperationalActions;
    expect(actions.map((item) => item.action)).toEqual(["First", "Second"]);
    for (const item of actions) {
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(item).toMatchObject({
        origin: "ai",
        status: "open",
        assigneeId: null,
        dueDate: "",
        blockedReason: "",
      });
    }
    expect(new Set(actions.map((item) => item.id)).size).toBe(2);
    expect(actions[0].sourceIds).toEqual(["S1"]);

    // Baseline equals the migrated plan; a plan without output stays empty.
    expect(byId["p-approved"].original_ai_output).toEqual(
      byId["p-approved"].action_plan,
    );
    expect(byId["p-empty"].action_plan).toBeNull();
    expect(byId["p-empty"].original_ai_output).toBeNull();

    // Approved plans pin their current version; others do not.
    expect(byId["p-approved"].approved_version).toBe(4);
    expect(byId["p-requested"].approved_version).toBeNull();

    // One revision per plan, at its current version, with the new ids in it.
    const revisions = await client.query<{
      plan_id: string;
      version: number;
      snapshot: { targetDate: string; actionPlan: unknown };
    }>(
      "select plan_id, version, snapshot from action_plan_revisions order by plan_id",
    );
    expect(revisions.rows.map((r) => [r.plan_id, r.version])).toEqual([
      ["p-approved", 4],
      ["p-empty", 1],
      ["p-requested", 2],
    ]);
    expect(revisions.rows[0].snapshot.targetDate).toBe("2026-12-01");
    expect(revisions.rows[0].snapshot.actionPlan).toEqual(
      byId["p-approved"].action_plan,
    );

    // The single notes field became a note; blank ones did not.
    const notes = await client.query<{ plan_id: string; body: string }>(
      "select plan_id, body from plan_notes",
    );
    expect(notes.rows).toEqual([{ plan_id: "p-approved", body: "Old note" }]);

    // An outstanding change request became an open request row.
    const requests = await client.query<{
      plan_id: string;
      comment: string;
      status: string;
    }>("select plan_id, comment, status from change_requests");
    expect(requests.rows).toEqual([
      { plan_id: "p-requested", comment: "Add a KPI.", status: "open" },
    ]);
  });
});

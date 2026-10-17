import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { describe, expect, it } from "vitest";

// Applies migrations 0000-0006, inserts plans as production held them before
// provenance was recorded, then applies 0007 and checks the backfill.
const dir = path.join(process.cwd(), "drizzle");

function sqlOf(prefix: string) {
  const file = fs.readdirSync(dir).find((name) => name.startsWith(prefix));

  if (!file) {
    throw new Error(`migration ${prefix} not found`);
  }

  return fs.readFileSync(path.join(dir, file), "utf8");
}

const action = (id: string, text: string) => ({
  id,
  action: text,
  sourceIds: ["S1"],
  origin: "ai",
  status: "open",
  assigneeId: null,
  dueDate: "",
  blockedReason: "",
});

const plan = {
  situationSummary: "s",
  recommendedOperationalActions: [
    action("a1", "First"),
    action("a2", "Second"),
  ],
  sources: [],
  grounding: { status: "ungrounded", retrievedCount: 0 },
};

describe("migration 0007 on existing data", () => {
  it("marks old actions unclassified and records the case each plan was generated from", async () => {
    const client = new PGlite({ extensions: { vector } });

    for (const prefix of [
      "0000",
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
    ]) {
      await client.exec(sqlOf(prefix));
    }

    const insert = (id: string, actionPlan: string, original: string) => `
      insert into action_plans
        (id, title, property, department, issue, current_metric, target_metric,
         operational_context, action_plan, original_ai_output,
         readiness_checklist, kpi_progress)
      values ('${id}', 't', 'Harbour House', 'Engineering', 'Issue', 'Now',
        'Target', 'Context', ${actionPlan}, ${original},
        '{}'::jsonb, '{}'::jsonb);`;
    const json = `'${JSON.stringify(plan)}'::jsonb`;

    await client.exec(insert("p-generated", json, json));
    await client.exec(insert("p-empty", "null", "null"));

    await client.exec(sqlOf("0007"));

    const rows = await client.query<{
      id: string;
      action_plan: {
        recommendedOperationalActions: Record<string, unknown>[];
      } | null;
      original_ai_output: {
        recommendedOperationalActions: Record<string, unknown>[];
      } | null;
      generated_case: Record<string, string> | null;
      drift_acknowledged: boolean;
    }>(
      "select id, action_plan, original_ai_output, generated_case, drift_acknowledged from action_plans order by id",
    );
    const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row]));
    const generated = byId["p-generated"];

    for (const list of [
      generated.action_plan!.recommendedOperationalActions,
      generated.original_ai_output!.recommendedOperationalActions,
    ]) {
      expect(list.map((item) => item.action)).toEqual(["First", "Second"]);
      for (const item of list) {
        expect(item).toMatchObject({
          claimType: "unclassified",
          evidence: null,
          downgradeReason: null,
          origin: "ai",
          sourceIds: ["S1"],
        });
      }
    }

    // No drift on day one: the case as it stands is the case on record.
    expect(generated.generated_case).toEqual({
      property: "Harbour House",
      department: "Engineering",
      issue: "Issue",
      currentMetric: "Now",
      targetMetric: "Target",
      operationalContext: "Context",
    });
    expect(generated.drift_acknowledged).toBe(false);

    // A plan with no AI output stays empty.
    expect(byId["p-empty"].action_plan).toBeNull();
    expect(byId["p-empty"].generated_case).toBeNull();
  });
});

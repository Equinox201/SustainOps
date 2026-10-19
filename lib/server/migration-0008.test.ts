import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { describe, expect, it } from "vitest";

// Applies migrations 0000-0007, inserts knowledge documents as production held
// them, then applies 0008 and checks the backfill and the new constraints.
const dir = path.join(process.cwd(), "drizzle");

function sqlOf(prefix: string) {
  const file = fs.readdirSync(dir).find((name) => name.startsWith(prefix));

  if (!file) {
    throw new Error(`migration ${prefix} not found`);
  }

  return fs.readFileSync(path.join(dir, file), "utf8");
}

const insert = (slug: string, version: number, status: string) => `
  insert into knowledge_documents
    (slug, title, department, document_type, region, version, status, content_hash)
  values ('${slug}', 'T ${slug}', 'Housekeeping', 'sop', 'apac', ${version}, '${status}', 'h-${slug}');`;

describe("migration 0008 on existing data", () => {
  it("gives versions a shared key and marks existing documents as shipped corpus", async () => {
    const client = new PGlite({ extensions: { vector } });

    for (const prefix of ["0000", "0001", "0002", "0003", "0004", "0005", "0006", "0007"]) {
      await client.exec(sqlOf(prefix));
    }

    await client.exec(insert("housekeeping-resource-efficiency-v1", 1, "superseded"));
    await client.exec(insert("housekeeping-resource-efficiency", 2, "approved"));
    await client.exec(insert("food-waste-sop", 3, "approved"));
    await client.exec(insert("scratch-draft", 1, "draft"));

    await client.exec(sqlOf("0008"));

    const rows = await client.query<{
      slug: string;
      document_key: string;
      origin: string;
      seed_status: string;
      index_status: string | null;
    }>(
      "select slug, document_key, origin, seed_status, index_status from knowledge_documents order by slug",
    );
    const bySlug = Object.fromEntries(rows.rows.map((row) => [row.slug, row]));

    // v1 and v2 of one document now share a key.
    expect(bySlug["housekeeping-resource-efficiency-v1"].document_key).toBe(
      "housekeeping-resource-efficiency",
    );
    expect(bySlug["housekeeping-resource-efficiency"].document_key).toBe(
      "housekeeping-resource-efficiency",
    );
    expect(bySlug["food-waste-sop"].document_key).toBe("food-waste-sop");

    for (const row of rows.rows) {
      expect(row.origin).toBe("corpus");
      expect(row.seed_status).not.toBeNull();
    }

    expect(bySlug["housekeeping-resource-efficiency"].index_status).toBe("available");
    expect(bySlug["scratch-draft"].index_status).toBeNull();

    // (key, version) is unique, and "withdrawn" is now a valid status.
    await expect(
      client.exec(insert("housekeeping-resource-efficiency-dupe", 2, "approved").replace(
        "'h-housekeeping-resource-efficiency-dupe')",
        "'h2', 'housekeeping-resource-efficiency')",
      ).replace("content_hash)", "content_hash, document_key)")),
    ).rejects.toThrow();
    await client.exec("update knowledge_documents set status = 'withdrawn' where slug = 'food-waste-sop'");
  });
});

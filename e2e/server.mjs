// Boots everything the end-to-end tests need, with no external services:
//
//   PGlite (in-memory Postgres, real migrations) -> exposed over TCP
//   a fake OpenAI Responses API                  -> deterministic plans
//   the production Next.js server                -> pointed at both
//
// The app talks to them through the same code paths as in production
// (postgres.js driver, official OpenAI SDK); only the other ends are fakes.
import { spawn, execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PORT = 54329;
const AI_PORT = 54330;
const APP_PORT = 3200;

// ---- database -------------------------------------------------------------
const pg = await PGlite.create({ extensions: { vector } });
await migrate(drizzle(pg), { migrationsFolder: path.join(root, "drizzle") });
// Supabase puts "extensions" on the search path; mirror it for pgvector.
await pg.exec("set search_path to public, extensions");

const dbServer = new PGLiteSocketServer({
  db: pg,
  host: "127.0.0.1",
  port: DB_PORT,
  maxConnections: 5,
});
await dbServer.start();
console.log(`[e2e] database ready on 127.0.0.1:${DB_PORT}`);

// ---- fake OpenAI ----------------------------------------------------------
const FIXTURE_SUMMARY =
  "E2E FIXTURE: laundry volume is trending above baseline because towel reuse is inconsistent.";

const aiPlan = {
  situationSummary: FIXTURE_SUMMARY,
  likelyRootCauses: [
    "Towel reuse cards are not placed consistently.",
    "Staff briefings on the reuse programme are infrequent.",
    "Guests are not told about the programme at check-in.",
  ],
  // The fake model cites S1 for every action, as a compliant model would.
  // The server keeps only citations that match what was really retrieved.
  recommendedOperationalActions: [
    { action: "Assign rooms by floor when occupancy is low.", sourceIds: ["S1"] },
    { action: "Hold a daily Front Office and Engineering check-in.", sourceIds: ["S1"] },
    { action: "Escalate any guest comfort complaint immediately.", sourceIds: ["S1"] },
  ],
  staffMicroTrainingMessage:
    "Every towel left on the rack is a towel we do not wash. Place the card, thank the guest.",
  managerChecklist: [
    "Confirm card placement in a sample of rooms daily.",
    "Record briefing attendance.",
    "Review laundry weight weekly.",
  ],
  kpisToMonitor: [
    "Laundry kg per occupied room per day",
    "Towel reuse rate (% of rooms)",
    "Briefing attendance rate",
  ],
  governancePrivacyNotes: [
    "Do not record guest names against reuse behaviour.",
    "All recommendations require human review before implementation.",
  ],
  followUpRecommendations: [
    "Review results after 30 days.",
    "Share findings with the Procurement team.",
  ],
  confidenceLevel: "High",
  humanReviewRequired: true,
};

const aiServer = http.createServer((request, response) => {
  if (request.method === "POST" && request.url?.endsWith("/responses")) {
    request.resume();
    request.on("end", () => {
      const body = {
        id: "resp_e2e",
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: "e2e-fake",
        output: [
          {
            type: "message",
            id: "msg_e2e",
            status: "completed",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(aiPlan),
                annotations: [],
              },
            ],
          },
        ],
        usage: { input_tokens: 111, output_tokens: 222, total_tokens: 333 },
      };

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    });
    return;
  }

  response.writeHead(404).end();
});
await new Promise((resolve) => aiServer.listen(AI_PORT, "127.0.0.1", resolve));
console.log(`[e2e] fake OpenAI ready on 127.0.0.1:${AI_PORT}`);

// ---- the app --------------------------------------------------------------
// Every variable the app reads is set explicitly, so a developer's .env.local
// (with real credentials) can never leak into a test run.
const env = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
  DATABASE_POOL_MAX: "2",
  OPENAI_API_KEY: "e2e-test-key",
  OPENAI_BASE_URL: `http://127.0.0.1:${AI_PORT}/v1`,
  OPENAI_MODEL: "e2e-fake",
  SESSION_SECRET: "e2e-session-secret-that-is-long-enough-123456",
  EMBEDDINGS_PROVIDER: "hash",
  GENERATION_LIMIT_PER_HOUR: "1000",
  GENERATION_IP_LIMIT_PER_HOUR: "1000",
  GENERATION_DAILY_CAP: "1000",
};
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

// Ingest the synthetic knowledge base with the offline embedder. This must
// be async: the database socket lives in this process, so blocking here would
// stop it from answering the ingest script.
console.log("[e2e] ingesting the knowledge base...");
await new Promise((resolve, reject) => {
  const ingest = spawn(
    process.execPath,
    [
      path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
      "scripts/ingest-knowledge.ts",
    ],
    { cwd: root, env, stdio: "inherit" },
  );

  ingest.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`ingestion exited with ${code}`)),
  );
});

if (!process.env.E2E_SKIP_BUILD) {
  console.log("[e2e] building the app...");
  execFileSync(process.execPath, [nextBin, "build"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
}

const app = spawn(
  process.execPath,
  [nextBin, "start", "-p", String(APP_PORT), "-H", "127.0.0.1"],
  { cwd: root, env, stdio: "inherit" },
);

async function shutdown(code = 0) {
  app.kill("SIGTERM");
  aiServer.close();
  await dbServer.stop().catch(() => {});
  await pg.close().catch(() => {});
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
app.on("exit", (code) => shutdown(code ?? 0));

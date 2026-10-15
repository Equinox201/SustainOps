import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { PlanContent } from "@/lib/schemas/action-plan";
import { setDbForTesting, type Database } from "@/lib/server/db";
import { createTestDb } from "@/lib/server/test-db";
import { GET as listPlansRoute, POST as createPlanRoute } from "../action-plans/route";
import { POST as transitionRoute } from "../action-plans/[id]/transition/route";
import { POST as demoRoute } from "../action-plans/demo/route";
import { POST as generateRoute } from "../action-plans/generate/route";
import { GET as auditRoute } from "../audit-events/route";
import { GET as cronResetRoute } from "../cron/reset-demo/route";
import { GET as healthRoute } from "../health/route";
import { POST as demoResetRoute } from "../demo/reset/route";
import { POST as loginRoute } from "../auth/login/route";
import { GET as meRoute } from "../auth/me/route";

process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters-long";
process.env.CRON_SECRET = "test-cron-secret-0123456789";
delete process.env.OPENAI_API_KEY;

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
  setDbForTesting(db);
});

beforeEach(async () => {
  await db.execute(
    sql`truncate action_plans, audit_events, ai_generations cascade`,
  );
});

const noParams = { params: Promise.resolve({}) };

function request(
  path: string,
  { method = "GET", body, cookie, contentType = "application/json" }: {
    method?: string;
    body?: unknown;
    cookie?: string;
    contentType?: string;
  } = {},
) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": contentType }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signIn(userId: string) {
  const response = await loginRoute(
    request("/api/auth/login", { method: "POST", body: { userId } }),
    noParams,
  );
  const setCookie = response.headers.get("set-cookie") ?? "";

  return setCookie.split(";")[0];
}

function content(overrides: Partial<PlanContent> = {}): PlanContent {
  const demo = demoActionPlans[0];

  return {
    sustainabilityCase: demo.sustainabilityCase,
    actionPlan: demo.actionPlan,
    generationId: null,
    owner: "Jordan Lee",
    priority: "High",
    targetDate: "2026-12-01",
    nextReviewDate: "2026-11-01",
    readinessChecklist: {
      actionsAreSpecific: true,
      kpisAreMeasurable: true,
      ownerAssigned: true,
      timelineDefined: true,
      privacyReviewed: true,
      staffMessageReady: true,
    },
    kpiProgress: { baseline: "", current: "", target: "", latestUpdate: "" },
    actionNotes: "",
    ...overrides,
  };
}

describe("authentication", () => {
  it("answers 401 with a structured error when not signed in", async () => {
    const response = await listPlansRoute(request("/api/action-plans"), noParams);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toMatchObject({
      code: "unauthenticated",
      requestId: expect.any(String),
    });
    expect(response.headers.get("x-request-id")).toBe(body.error.requestId);
  });

  it("rejects a forged or tampered session cookie", async () => {
    const cookie = await signIn("usr_maya_chen");
    const tampered = `${cookie.slice(0, -4)}AAAA`;
    const response = await listPlansRoute(
      request("/api/action-plans", { cookie: tampered }),
      noParams,
    );

    expect(response.status).toBe(401);
  });

  it("sets an HttpOnly cookie and identifies the user", async () => {
    const response = await loginRoute(
      request("/api/auth/login", {
        method: "POST",
        body: { userId: "usr_daniel_ortiz" },
      }),
      noParams,
    );

    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);

    const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
    const me = await meRoute(request("/api/auth/me", { cookie }), noParams);

    expect((await me.json()).user).toMatchObject({
      id: "usr_daniel_ortiz",
      role: "reviewer",
    });
  });

  it("does not sign in unknown users", async () => {
    const response = await loginRoute(
      request("/api/auth/login", { method: "POST", body: { userId: "nobody" } }),
      noParams,
    );

    expect(response.status).toBe(404);
  });
});

describe("authorization and validation", () => {
  it("lets a manager create but not a reviewer (403)", async () => {
    const manager = await signIn("usr_maya_chen");
    const reviewer = await signIn("usr_daniel_ortiz");

    const denied = await createPlanRoute(
      request("/api/action-plans", {
        method: "POST",
        body: content(),
        cookie: reviewer,
      }),
      noParams,
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe("forbidden");

    const created = await createPlanRoute(
      request("/api/action-plans", {
        method: "POST",
        body: content(),
        cookie: manager,
      }),
      noParams,
    );
    expect(created.status).toBe(201);
  });

  it("returns 400 with field-level details for invalid bodies", async () => {
    const cookie = await signIn("usr_maya_chen");
    const response = await createPlanRoute(
      request("/api/action-plans", {
        method: "POST",
        cookie,
        body: {
          ...content(),
          owner: "x".repeat(500),
          sustainabilityCase: { ...content().sustainabilityCase, issue: "" },
        },
      }),
      noParams,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "owner" }),
        expect.objectContaining({ path: "sustainabilityCase.issue" }),
      ]),
    );
  });

  it("rejects unknown fields so clients cannot set server-owned state", async () => {
    const cookie = await signIn("usr_maya_chen");
    const response = await createPlanRoute(
      request("/api/action-plans", {
        method: "POST",
        cookie,
        body: { ...content(), approved: true },
      }),
      noParams,
    );

    expect(response.status).toBe(400);
  });

  it("blocks cross-site state-changing requests, even without a body", async () => {
    const cookie = await signIn("usr_maya_chen");
    const forged = (headers: Record<string, string>) =>
      new Request("http://localhost/api/action-plans/demo", {
        method: "POST",
        headers: { cookie, host: "localhost", ...headers },
      });

    const attacks: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site" },
      { origin: "https://evil.example" },
    ];

    for (const headers of attacks) {
      const response = await demoRoute(forged(headers), noParams);

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("cross_site_request");
    }

    const sameOrigin = await demoRoute(
      forged({ "sec-fetch-site": "same-origin", origin: "http://localhost" }),
      noParams,
    );
    expect(sameOrigin.status).toBe(200);
  });

  it("rejects non-JSON content types (415)", async () => {
    const cookie = await signIn("usr_maya_chen");
    const response = await createPlanRoute(
      request("/api/action-plans", {
        method: "POST",
        body: content(),
        cookie,
        contentType: "text/plain",
      }),
      noParams,
    );

    expect(response.status).toBe(415);
  });

  it("enforces the separation of authoring and approval end to end", async () => {
    const manager = await signIn("usr_maya_chen");
    const reviewer = await signIn("usr_daniel_ortiz");
    const created = await createPlanRoute(
      request("/api/action-plans", {
        method: "POST",
        body: content(),
        cookie: manager,
      }),
      noParams,
    );
    const { plan } = await created.json();
    const params = { params: Promise.resolve({ id: plan.id }) };
    const approve = (cookie: string) =>
      transitionRoute(
        request(`/api/action-plans/${plan.id}/transition`, {
          method: "POST",
          body: { event: "approve" },
          cookie,
        }),
        params,
      );

    expect((await approve(manager)).status).toBe(403);

    const approved = await approve(reviewer);
    expect(approved.status).toBe(200);
    expect((await approved.json()).plan).toMatchObject({
      approved: true,
      approvedBy: { name: "Daniel Ortiz" },
    });
  });

  it("limits the organisation audit log to managers and reviewers", async () => {
    const department = await signIn("usr_priya_nair");
    const reviewer = await signIn("usr_daniel_ortiz");

    expect(
      (await auditRoute(request("/api/audit-events", { cookie: department }), noParams))
        .status,
    ).toBe(403);
    expect(
      (await auditRoute(request("/api/audit-events", { cookie: reviewer }), noParams))
        .status,
    ).toBe(200);
  });

  it("forbids generation for roles without the permission", async () => {
    const reviewer = await signIn("usr_daniel_ortiz");
    const response = await generateRoute(
      request("/api/action-plans/generate", {
        method: "POST",
        cookie: reviewer,
        body: { sustainabilityCase: content().sustainabilityCase },
      }),
      noParams,
    );

    expect(response.status).toBe(403);
  });

  it("reports a missing AI key as a configuration error, not a crash", async () => {
    const manager = await signIn("usr_maya_chen");
    const response = await generateRoute(
      request("/api/action-plans/generate", {
        method: "POST",
        cookie: manager,
        body: { sustainabilityCase: content().sustainabilityCase },
      }),
      noParams,
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ai_not_configured");
  });
});

describe("public demo operations", () => {
  it("reports health without revealing configuration", async () => {
    const response = await healthRoute(request("/api/health"), noParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", database: "ok" });
    expect(JSON.stringify(body)).not.toMatch(/secret|password|postgres:/i);
  });

  it("refuses the scheduled reset without the cron secret", async () => {
    const none = await cronResetRoute(request("/api/cron/reset-demo"), noParams);
    expect(none.status).toBe(401);

    const wrong = await cronResetRoute(
      new Request("http://localhost/api/cron/reset-demo", {
        headers: { authorization: "Bearer not-the-secret-0123456789" },
      }),
      noParams,
    );
    expect(wrong.status).toBe(401);
  });

  it("runs the scheduled reset with the cron secret", async () => {
    const manager = await signIn("usr_maya_chen");
    await createPlanRoute(
      request("/api/action-plans", {
        method: "POST",
        body: content({ owner: "Temp" }),
        cookie: manager,
      }),
      noParams,
    );

    const response = await cronResetRoute(
      new Request("http://localhost/api/cron/reset-demo", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
      noParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.restored).toBe(demoActionPlans.length);

    const list = await listPlansRoute(
      request("/api/action-plans", { cookie: manager }),
      noParams,
    );
    const { plans } = await list.json();
    expect(plans).toHaveLength(demoActionPlans.length);
  });

  it("lets only a manager reset the demo by hand", async () => {
    const reviewer = await signIn("usr_daniel_ortiz");
    const manager = await signIn("usr_maya_chen");
    const reset = (cookie: string) =>
      demoResetRoute(
        request("/api/demo/reset", { method: "POST", cookie }),
        noParams,
      );

    expect((await reset(reviewer)).status).toBe(403);
    expect((await reset(manager)).status).toBe(200);
  });
});

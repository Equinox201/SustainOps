import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe("signed out", () => {
  test("shows the persona picker and the API answers 401", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Continue as Maya/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create New Action Plan" }),
    ).toHaveCount(0);

    const response = await request.get("/api/action-plans");
    expect(response.status()).toBe(401);
    expect((await response.json()).error).toMatchObject({
      code: "unauthenticated",
      requestId: expect.any(String),
    });
  });
});

test.describe("what each role is offered", () => {
  test("a reviewer cannot create or seed plans", async ({ page }) => {
    await signInAs(page, "Daniel");

    // Wait for the list to finish loading, so the absences below are real
    // and not just "nothing has rendered yet".
    await expect(
      page.getByText("Current Sustainability Workflow"),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Create New Action Plan" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Load Demo Cases" }),
    ).toHaveCount(0);
  });

  test("a department manager only sees their own department", async ({
    page,
  }) => {
    // Maya seeds the fictional demo plans (Engineering, F&B, Procurement).
    await signInAs(page, "Maya");
    await page.getByRole("button", { name: "Load Demo Cases" }).first().click();
    await expect(
      page.getByText(/Supplier sustainability screening/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Switch user" }).click();
    await page.getByRole("button", { name: /Continue as Priya/ }).click();

    await expect(page.getByText(/Low-occupancy floor energy/)).toBeVisible();
    await expect(page.getByText(/Breakfast buffet croissant/)).toHaveCount(0);
    await expect(
      page.getByText(/Supplier sustainability screening/),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Create New Action Plan" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Insights & Knowledge" }),
    ).toHaveCount(0);
  });
});

test.describe("the server refuses what the UI hides", () => {
  test("role checks hold when the API is called directly", async ({
    playwright,
    baseURL,
  }) => {
    const as = async (userId: string) => {
      const context = await playwright.request.newContext({ baseURL });
      const login = await context.post("/api/auth/login", { data: { userId } });
      expect(login.ok()).toBeTruthy();
      return context;
    };

    const manager = await as("usr_maya_chen");
    const reviewer = await as("usr_daniel_ortiz");
    const department = await as("usr_priya_nair");

    // Seed, then pick any plan.
    await manager.post("/api/action-plans/demo");
    const { plans } = await (await manager.get("/api/action-plans")).json();
    const planId = plans[0].id as string;

    // A manager cannot approve; a reviewer cannot create or delete.
    const approve = await manager.post(
      `/api/action-plans/${planId}/transition`,
      {
        data: { event: "approve", expectedVersion: plans[0].version },
      },
    );
    expect(approve.status()).toBe(403);

    const create = await reviewer.post("/api/action-plans", {
      data: { ...plans[0], id: undefined },
    });
    expect([400, 403]).toContain(create.status());

    const remove = await reviewer.delete(`/api/action-plans/${planId}`);
    expect(remove.status()).toBe(403);

    // A department manager cannot read the organisation audit log.
    expect((await department.get("/api/audit-events")).status()).toBe(403);
    expect((await reviewer.get("/api/audit-events")).status()).toBe(200);

    // A cross-site request is rejected even with a valid session.
    const forged = await manager.post("/api/action-plans/demo", {
      headers: { origin: "https://evil.example" },
    });
    expect(forged.status()).toBe(403);
    expect((await forged.json()).error.code).toBe("cross_site_request");
  });
});

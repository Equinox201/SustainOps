import { expect, test } from "@playwright/test";
import { openSection, signInAs, toolbar } from "./helpers";

// Seeds the fictional demo plans through the API and returns them, so each
// test starts from known data without clicking through the UI.
async function seedPlans(page: import("@playwright/test").Page) {
  // Let the page's own initial request finish first: the in-memory test
  // database serves one transaction at a time, and overlapping the seed with
  // the list fetch is a test-harness artefact, not product behaviour.
  await expect(page.getByText("Current Sustainability Workflow")).toBeVisible();

  const response = await page.request.post("/api/action-plans/demo");
  expect(response.status(), await response.text()).toBe(200);
  const list = await page.request.get("/api/action-plans");
  const { plans } = (await list.json()) as {
    plans: {
      id: string;
      version: number;
      approved: boolean;
      completed: boolean;
      sustainabilityCase: { department: string };
    }[];
  };
  return plans;
}

test.describe("addresses", () => {
  test("a plan has its own URL that survives a reload and Back", async ({
    page,
  }) => {
    await signInAs(page, "Maya");
    const plans = await seedPlans(page);
    await page.reload();

    const first = plans[0];
    await page.getByRole("button", { name: "View / Edit" }).first().click();
    await expect(page.getByText("Action Plan Editor")).toBeVisible();
    await expect(page).toHaveURL(/\/plans\/[^/]+$/);

    // A reload lands on the same plan, not on the list.
    await page.reload();
    await expect(page.getByText("Action Plan Editor")).toBeVisible();
    await expect(page).toHaveURL(/\/plans\/[^/]+$/);

    // Back returns to the list without a full page load.
    await page.goBack();
    await expect(
      page.getByText("Current Sustainability Workflow"),
    ).toBeVisible();
    await expect(page.getByText("Action Plan Editor")).toHaveCount(0);

    // A deep link opens the plan directly.
    await page.goto(`/plans/${first.id}`);
    await expect(page.getByText("Action Plan Editor")).toBeVisible();
  });

  test("an unknown plan id says so instead of showing an empty page", async ({
    page,
  }) => {
    await signInAs(page, "Maya");
    await page.goto("/plans/plan_does_not_exist");
    await expect(page.getByText("Plan not found")).toBeVisible();
    await page.getByRole("button", { name: "Back to action plans" }).click();
    await expect(
      page.getByText("Current Sustainability Workflow"),
    ).toBeVisible();
  });

  test("list filters live in the address and are restored on reload", async ({
    page,
  }) => {
    await signInAs(page, "Maya");
    const plans = await seedPlans(page);
    await page.reload();

    const department = plans[0].sustainabilityCase.department;
    await page
      .getByRole("region", { name: "Filter plans" })
      .getByLabel(/^Department/)
      .selectOption(department);
    await expect(page).toHaveURL(new RegExp(`department=`));

    const expected = plans.filter(
      (plan) => plan.sustainabilityCase.department === department,
    ).length;
    await expect(
      page.getByText(`Showing ${expected} of ${plans.length}`),
    ).toBeVisible();

    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "Filter plans" })
        .getByLabel(/^Department/),
    ).toHaveValue(department);
    await expect(
      page.getByText(`Showing ${expected} of ${plans.length}`),
    ).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(
      page.getByText(`Showing ${plans.length} of ${plans.length}`),
    ).toBeVisible();
  });
});

test.describe("concurrent edits", () => {
  test("a stale save is refused, and the latest version can be loaded", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const baseURL = `http://127.0.0.1:3200`;

    try {
      await signInAs(pageA, "Maya");
      const plans = await seedPlans(pageA);
      // Earlier specs share this database, so skip plans that are approved or
      // done: those are locked and not editable.
      const target = plans.find((plan) => !plan.approved && !plan.completed);
      expect(target, "an editable plan to work with").toBeDefined();

      await signInAs(pageB, "Maya");

      for (const page of [pageA, pageB]) {
        await page.goto(`${baseURL}/plans/${target!.id}`);
        await expect(page.getByText("Action Plan Editor")).toBeVisible();
        await openSection(page, /Operational Case Form/);
      }

      const priorityA = pageA.getByLabel(/^Priority/);
      const priorityB = pageB.getByLabel(/^Priority/);
      const original = await priorityA.inputValue();
      const [forB, forA] = ["High", "Medium", "Low"]
        .filter((value) => value !== original)
        .slice(0, 2);

      // B saves first.
      await priorityB.selectOption(forB);
      await toolbar(pageB)
        .getByRole("button", { name: "Save Action Plan" })
        .click();
      await expect(pageB.getByText("Action plan saved.")).toBeVisible();

      // A is now looking at an old copy; its save must not silently win.
      await priorityA.selectOption(forA);
      await toolbar(pageA)
        .getByRole("button", { name: "Save Action Plan" })
        .click();
      const conflict = pageA
        .getByRole("alert")
        .filter({ hasText: /changed by someone else/ });
      await expect(conflict).toBeVisible();

      // The server kept B's change.
      const stored = await pageA.request.get(`/api/action-plans/${target!.id}`);
      expect((await stored.json()).plan.priority).toBe(forB);

      // Loading the latest copy discards A's edit and shows B's.
      await pageA
        .getByRole("button", { name: /Load the latest version/ })
        .click();
      await expect(conflict).toHaveCount(0);
      await expect(pageA.getByLabel(/^Priority/)).toHaveValue(forB);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInAs, switchTo } from "./helpers";

// Captures the README screenshots from the seeded, fictional demo plans.
// Skipped unless CAPTURE_SCREENSHOTS=1, so it never runs in CI or `npm run e2e`:
//
//   CAPTURE_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
//
// It uses the same fake AI and in-memory database as the other end-to-end tests,
// so it needs no credentials and shows no real data.
const OUT = path.join(__dirname, "..", "assets", "screenshots");

test.skip(!process.env.CAPTURE_SCREENSHOTS, "set CAPTURE_SCREENSHOTS=1 to capture");
test.use({ viewport: { width: 1280, height: 900 } });

async function seed(page: Page) {
  await signInAs(page, "Maya");
  await expect(page.getByText("Current Sustainability Workflow")).toBeVisible();
  await page.request.post("/api/demo/reset");
  await page.reload();
  await expect(page.getByText("Current Sustainability Workflow")).toBeVisible();
  await expect(page.locator("article", { hasText: "Breakfast buffet croissant" })).toBeVisible();
}

/**
 * Captures a region of the full page. Clipping a full-page capture (rather than
 * screenshotting an element) keeps the sticky toolbar at the top of the page
 * instead of letting it land in the middle of the image.
 */
async function capture(
  page: Page,
  from: Locator,
  file: string,
  to: Locator = from,
) {
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  const scroll = await page.evaluate(() => window.scrollY);

  if (!a || !b) {
    throw new Error(`cannot measure the region for ${file}`);
  }

  const top = a.y + scroll;
  const bottom = b.y + scroll + b.height;

  // Sticky elements render where the page is scrolled to; capture from the top
  // so the toolbar sits at the top of the page rather than inside the region.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(OUT, file),
    fullPage: true,
    clip: { x: a.x, y: top, width: a.width, height: bottom - top },
  });
}

async function open(page: Page, title: string) {
  await page
    .locator("article", { hasText: title })
    .getByRole("button", { name: "View / Edit" })
    .click();
  await expect(page.getByText("Action Plan Editor")).toBeVisible();
}

test("captures the README screenshots", async ({ page }) => {
  await seed(page);

  // 1. The operational overview and the plans it summarises.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(OUT, "01-overview.png"),
    fullPage: true,
    clip: { x: 0, y: 0, width: 1280, height: 1362 },
  });

  // 2. A plan with its evidence: a verified quotation, and a claim the server downgraded.
  await open(page, "Breakfast buffet croissant");
  const actions = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Recommended Operational Actions" }),
  }).last();
  const items = actions.getByTestId("action-item");
  await expect(items).toHaveCount(4);

  for (const index of [0, 2]) {
    await items.nth(index).locator("details").locator("summary").click();
  }

  await expect(items.nth(0).locator("mark")).toBeVisible();
  await expect(items.nth(2)).toContainText("quotation the AI gave was not found");
  // The first three actions: a verified quotation, one more, and the downgraded claim.
  await capture(page, actions, "02-evidence.png", items.nth(2));

  // 3. The review loop: a reviewer's change request, and the author's response.
  await page.goto("/");
  await expect(page.getByText("Current Sustainability Workflow")).toBeVisible();
  await switchTo(page, "Daniel");
  await open(page, "Room assignment during low occupancy");
  await page
    .getByPlaceholder(/What needs to change/)
    .fill("Name an owner for the daily Front Office and Engineering check-in, and say how comfort complaints will be tracked.");
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByText("Changes requested by the reviewer")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Current Sustainability Workflow")).toBeVisible();
  await switchTo(page, "Maya");
  await open(page, "Room assignment during low occupancy");
  await page
    .getByLabel("Your response")
    .fill("Priya Nair owns the daily check-in. Comfort complaints are logged by the duty engineer and reviewed weekly.");
  const summary = page.locator("div.rounded-lg").filter({ hasText: "Action Plan Editor" }).first();
  await capture(page, summary, "03-review-change-request.png");
});

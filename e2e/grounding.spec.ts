import { expect, test } from "@playwright/test";
import { signInAs, toolbar } from "./helpers";

test.describe("grounded generation", () => {
  test("a case with no matching approved source is labelled general guidance", async ({
    page,
  }) => {
    await signInAs(page, "Maya");
    await page
      .getByRole("button", { name: "Create New Action Plan" })
      .first()
      .click();

    await page
      .getByLabel("Sustainability Issue", { exact: true })
      .fill("Quantum chess tournament scheduling");
    await page.getByLabel(/^Department/).selectOption("Sales & Marketing");
    await page
      .getByLabel("Current Metric", { exact: true })
      .fill("Seventeen grandmasters");
    await page
      .getByLabel("Target Metric", { exact: true })
      .fill("Zero overlapping rounds");
    await page
      .getByLabel(/^Operational Context/)
      .fill("Venue acoustics and trophy engraving.");

    await page
      .getByRole("button", { name: "Generate Action Plan", exact: true })
      .first()
      .click();

    // The fake model claims High confidence and cites S1, which was never
    // retrieved. The server drops the citation and caps confidence.
    await expect(page.getByText("General guidance only")).toBeVisible();
    await expect(page.getByText("No approved source").first()).toBeVisible();
    await expect(page.getByText("Sources retrieved")).toHaveCount(0);

    const confidence = page
      .locator("div", { hasText: /^Confidence Level/ })
      .last();
    await expect(confidence).toContainText("Low");

    // It can still be saved: grounding is information, not a gate.
    await toolbar(page)
      .getByRole("button", { name: "Save Action Plan" })
      .click();
    await expect(page.getByText("Action plan saved.")).toBeVisible();
  });

  test("the demo plans cite real sections of the knowledge base", async ({
    page,
  }) => {
    await signInAs(page, "Maya");
    await page.getByRole("button", { name: "Load Demo Cases" }).first().click();
    await expect(
      page.getByText(/Supplier sustainability screening/),
    ).toBeVisible();

    await page
      .locator("article", { hasText: "Breakfast buffet croissant" })
      .getByRole("button", { name: "View / Edit" })
      .click();

    await expect(
      page.getByText("Grounded in approved company sources"),
    ).toBeVisible();
    await expect(
      page
        .getByLabel("Sources")
        .first()
        .getByText(/Food Waste Measurement and Buffet Guidelines v3 §2\.1/),
    ).toBeVisible();

    // The retrieved excerpts are frozen into the plan and can be opened.
    await page.getByText(/S1 · Food Waste Measurement/).click();
    await expect(
      page
        .locator("details[open]", { hasText: /S1 · Food Waste Measurement/ })
        .getByText(/Weigh waste at the point it is generated/),
    ).toBeVisible();
  });

  test("the knowledge catalogue shows approved and superseded documents", async ({
    page,
  }) => {
    await signInAs(page, "Maya");
    await page.getByRole("button", { name: "Insights & Knowledge" }).click();

    await expect(
      page.getByText(/approved documents · \d+ citeable sections/),
    ).toBeVisible();
    await expect(
      page.getByText("Energy and HVAC Operations SOP"),
    ).toBeVisible();
    await expect(page.getByText("superseded", { exact: true })).toBeVisible();
  });
});

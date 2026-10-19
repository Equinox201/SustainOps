import { expect, test, type Page } from "@playwright/test";
import { signInAs, switchTo } from "./helpers";

async function openKnowledge(page: Page) {
  await page
    .getByRole("button", { name: /Insights & Knowledge/ })
    .first()
    .click();
  await expect(page.getByText("What plans are grounded in")).toBeVisible();
}

const card = (page: Page, title: string, version: string) =>
  page
    .getByTestId("knowledge-document")
    .filter({ hasText: title })
    .filter({ hasText: new RegExp(`v${version} ·`) });

test("a new policy version is drafted by a manager, published by a reviewer, and flags the plans built on the old one", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());

  try {
    // --- Maya (manager) writes a new version of the energy SOP -------------
    await signInAs(page, "Maya");
    await page.request.post("/api/action-plans/demo");
    await page.reload();
    await openKnowledge(page);

    // Managers can write; they cannot publish their own work.
    await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);

    await card(page, "Energy and HVAC Operations SOP", "2")
      .getByRole("button", { name: "Write a new version" })
      .click();
    const text = page.getByLabel("Document text");
    const current = await text.inputValue();
    await text.fill(current.replace("45 percent", "30 percent"));

    await page.getByRole("button", { name: "Preview sections" }).click();
    await expect(page.getByLabel("Section preview")).toContainText("§2.2");

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/Draft saved/)).toBeVisible();

    const draft = card(page, "Energy and HVAC Operations SOP", "3");
    await expect(draft).toContainText("draft");
    await expect(draft).toContainText("0 sections");

    // Until it is published, nothing changes for existing plans.
    await page
      .getByRole("button", { name: /Action Plans/ })
      .first()
      .click();
    await expect(page.getByText("Sources changed")).toHaveCount(0);

    // --- Daniel (reviewer) publishes it ------------------------------------
    await switchTo(page, "Daniel");
    await openKnowledge(page);
    await expect(
      page.getByRole("button", { name: "Write a new version" }),
    ).toHaveCount(0);

    await card(page, "Energy and HVAC Operations SOP", "3")
      .getByRole("button", { name: "Publish" })
      .click();
    await expect(
      page.getByText("Published Energy and HVAC Operations SOP v3."),
    ).toBeVisible();

    await expect(
      card(page, "Energy and HVAC Operations SOP", "3"),
    ).toContainText("approved");
    await expect(
      card(page, "Energy and HVAC Operations SOP", "2"),
    ).toContainText("superseded");

    // --- the plans built on v2 are flagged, not rewritten -------------------
    await expect(
      page.getByRole("region", { name: "Plans affected by knowledge changes" }),
    ).toContainText("v3 now applies");

    await page
      .getByRole("button", { name: /Action Plans/ })
      .first()
      .click();
    const energyCard = page.locator("article", {
      hasText: "Low-occupancy floor energy reduction",
    });
    await expect(energyCard.getByText("Sources changed")).toBeVisible();
    await energyCard.getByRole("button", { name: "View / Edit" }).click();
    await expect(
      page.getByText("Knowledge this plan relied on has changed"),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Energy and HVAC Operations SOP v2 was superseded; v3 now applies/,
      ),
    ).toBeVisible();
    // It still shows the version it was written against.
    await expect(
      page
        .getByLabel("Sources")
        .first()
        .getByText(/Energy and HVAC Operations SOP v2 §2\.2/),
    ).toBeVisible();

    // --- a reviewer can withdraw a document, with a reason ------------------
    await page.getByRole("button", { name: "Back to Action Plans" }).click();
    await openKnowledge(page);
    await card(page, "Energy and HVAC Operations SOP", "3")
      .getByRole("button", { name: "Withdraw…" })
      .click();
    await page
      .getByLabel("Why is it being withdrawn?")
      .fill("Threshold under review");
    await page.getByRole("button", { name: "Withdraw document" }).click();
    await expect(
      page.getByText("Withdrew Energy and HVAC Operations SOP v3."),
    ).toBeVisible();
    await expect(
      card(page, "Energy and HVAC Operations SOP", "3"),
    ).toContainText("withdrawn");
  } finally {
    // The knowledge base is shared by every spec: put it back.
    await switchTo(page, "Maya");
    const reset = await page.request.post("/api/demo/reset");
    expect(reset.ok()).toBeTruthy();
  }
});

test("the editor explains a bad draft instead of saving it", async ({
  page,
}) => {
  await signInAs(page, "Maya");
  await openKnowledge(page);
  await page.getByRole("button", { name: "Write a document" }).click();
  await page.getByLabel("Title").fill("A document with no sections");
  await page
    .getByLabel("Document text")
    .fill("Just prose, with nothing citeable in it.");
  await page.getByRole("button", { name: "Preview sections" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /numbered/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Knowledge document editor")).toHaveCount(0);
});

import { expect, test, type Locator, type Page } from "@playwright/test";
import { openSection, signInAs, switchTo, toolbar } from "./helpers";

// Creates and saves a plan for a case the energy SOP covers, so retrieval
// finds section 2.2 and the fake model's quotation from it is genuine.
async function createGeneratedPlan(page: Page, issue: string) {
  page.on("dialog", (dialog) => dialog.accept());
  await signInAs(page, "Maya");
  await page
    .getByRole("button", { name: "Create New Action Plan" })
    .first()
    .click();
  await page.getByLabel("Sustainability Issue", { exact: true }).fill(issue);
  await page.getByLabel(/^Department/).selectOption("Engineering");
  await page
    .getByLabel("Current Metric", { exact: true })
    .fill("Occupancy below 45% for three nights; all floors still conditioned");
  await page
    .getByLabel("Target Metric", { exact: true })
    .fill("Reduce kWh per occupied room within 30 days");
  await page
    .getByLabel(/^Operational Context/)
    .fill(
      "Front Office assigns rooms across every floor, so Engineering cannot set back unused floors in air-conditioning and lighting.",
    );
  await page
    .getByRole("button", { name: "Generate Action Plan", exact: true })
    .first()
    .click();
  await expect(page.getByText(/E2E FIXTURE: laundry volume/)).toBeVisible();
}

// Opens an action's evidence panel, whichever state it was left in.
async function openEvidence(item: Locator) {
  const details = item.locator("details");

  if (
    !(await details.evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await details.locator("summary").click();
  }
}

async function makeReady(page: Page) {
  await openSection(page, /Operational Case Form/);
  await page.getByLabel("Owner", { exact: true }).fill("Priya Nair");
  await page.getByLabel("Target Date", { exact: true }).fill("2026-12-01");
  await page.getByLabel("Next Review Date", { exact: true }).fill("2026-11-01");

  for (const box of await page.getByRole("checkbox").all()) {
    await box.check();
  }
}

test("the server verifies what the AI claims a source says", async ({
  page,
}) => {
  await createGeneratedPlan(page, `E2E provenance ${Date.now()}`);
  await toolbar(page).getByRole("button", { name: "Save Action Plan" }).click();
  await expect(page.getByText("Action plan saved.")).toBeVisible();

  const actions = page.getByTestId("action-item");

  // Action 1: a genuine quotation, kept as a policy requirement.
  const verified = actions.nth(0);
  await expect(
    verified.getByText("Policy requirement", { exact: true }),
  ).toBeVisible();
  await openEvidence(verified);
  await expect(verified.getByText(/Quoted from the source/)).toBeVisible();
  await expect(verified.locator("mark")).toContainText(
    "Front Office assigns rooms by floor where guest preferences allow",
  );
  await expect(
    verified.getByText("Same department (Engineering)"),
  ).toBeVisible();

  // Action 2: a paraphrase offered as a quotation, downgraded with the reason.
  const downgraded = actions.nth(1);
  await expect(downgraded.getByText("Proposal", { exact: true })).toBeVisible();
  await openEvidence(downgraded);
  await expect(
    downgraded.getByText(/quotation the AI gave was not found in the source/),
  ).toBeVisible();

  // Rewording a verified action means the quotation no longer vouches for it.
  await verified
    .getByRole("textbox")
    .first()
    .fill("Assign rooms by floor, always");
  await toolbar(page).getByRole("button", { name: "Save Action Plan" }).click();
  await expect(page.getByText("Action plan saved.")).toBeVisible();
  await expect(verified.getByText("Proposal", { exact: true })).toBeVisible();
  await openEvidence(verified);
  await expect(verified.getByText(/reworded this action/)).toBeVisible();
});

test("a plan whose case changed is stale until regenerated or acknowledged", async ({
  page,
}) => {
  const issue = `E2E drift ${Date.now()}`;
  await createGeneratedPlan(page, issue);
  await makeReady(page);
  await toolbar(page).getByRole("button", { name: "Save Action Plan" }).click();
  await expect(page.getByText("Action plan saved.")).toBeVisible();
  await expect(page.getByText("This plan may be out of date")).toHaveCount(0);

  // The case changes after generation.
  await page
    .getByLabel(/^Operational Context/)
    .fill("Occupancy has recovered and every floor is now in use.");
  await expect(page.getByText("This plan may be out of date")).toBeVisible();
  await expect(page.getByText(/Operational context/).first()).toBeVisible();
  await toolbar(page).getByRole("button", { name: "Save Action Plan" }).click();
  await expect(page.getByText("Action plan saved.")).toBeVisible();
  await expect(page.getByText("This plan may be out of date")).toBeVisible();

  // The reviewer cannot approve it, and cannot wave it through.
  await switchTo(page, "Daniel");
  await page
    .locator("article", { hasText: issue })
    .getByRole("button", { name: "View / Edit" })
    .click();
  await expect(page.getByText("This plan may be out of date")).toBeVisible();
  await expect(
    toolbar(page).getByRole("button", { name: "Approve" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirm the plan still applies" }),
  ).toHaveCount(0);

  // The author confirms, in writing, that it still applies.
  await switchTo(page, "Maya");
  await page
    .locator("article", { hasText: issue })
    .getByRole("button", { name: "View / Edit" })
    .click();
  await page
    .getByLabel("Why the plan still applies")
    .fill("The floor setback steps do not depend on occupancy recovering.");
  await page
    .getByRole("button", { name: "Confirm the plan still applies" })
    .click();
  await expect(page.getByText(/accepted the plan as it stands/)).toBeVisible();

  await switchTo(page, "Daniel");
  await page
    .locator("article", { hasText: issue })
    .getByRole("button", { name: "View / Edit" })
    .click();
  await toolbar(page).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Approved by/)).toContainText("Daniel Ortiz");
});

test("managers and reviewers can see why each section was or was not used", async ({
  page,
}) => {
  await createGeneratedPlan(page, `E2E retrieval ${Date.now()}`);
  await toolbar(page).getByRole("button", { name: "Save Action Plan" }).click();
  await expect(page.getByText("Action plan saved.")).toBeVisible();

  await page.getByRole("button", { name: "Show retrieval record" }).click();
  const record = page.getByText("Retrieval record").locator("..");
  await expect(record.getByText(/Given to the model: \d+/)).toBeVisible();
  await expect(
    record.getByText(/Another department's document: \d+/),
  ).toBeVisible();
  await expect(record.getByText(/Not an approved document: \d+/)).toBeVisible();
  await expect(
    record.getByText(/Policy requirements verified: 1 of 2 claimed/),
  ).toBeVisible();
  await expect(
    record.getByRole("row", {
      name: /Energy and HVAC Operations SOP v2 §2\.2.*Given to the model/,
    }),
  ).toBeVisible();

  // A department manager does not get the record.
  await switchTo(page, "Priya");
  await page.getByRole("button", { name: "View / Edit" }).first().click();
  await expect(page.getByText("Action Plan Editor")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show retrieval record" }),
  ).toHaveCount(0);
});

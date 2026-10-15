import { expect, test } from "@playwright/test";
import { openPlan, openSection, signInAs, switchTo, toolbar } from "./helpers";

// One plan travels the whole governed workflow, with a different person
// (and role) at every step.
test("a plan moves from case to completion across four roles", async ({
  page,
}) => {
  const issue = `E2E floors kept conditioned at low occupancy ${Date.now()}`;
  page.on("dialog", (dialog) => dialog.accept());

  // --- Maya (Sustainability Manager) creates a case and generates a plan ----
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

  // The plan is grounded: every action cites a real, retrieved section.
  await expect(
    page.getByText("Grounded in approved company sources"),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Sources")
      .first()
      .getByText(/Energy and HVAC Operations SOP v2 §2\.2/),
  ).toBeVisible();

  // The manager can author and save, but has no way to approve.
  await expect(
    toolbar(page).getByRole("button", { name: "Approve" }),
  ).toHaveCount(0);

  // --- accountability and readiness, then save ------------------------------
  await openSection(page, /Operational Case Form/);
  await page.getByLabel("Owner", { exact: true }).fill("Priya Nair");
  await page.getByLabel("Target Date", { exact: true }).fill("2026-12-01");
  await page.getByLabel("Next Review Date", { exact: true }).fill("2026-11-01");

  for (const box of await page.getByRole("checkbox").all()) {
    await box.check();
  }

  await toolbar(page).getByRole("button", { name: "Save Action Plan" }).click();
  await expect(page.getByText("Action plan saved.")).toBeVisible();

  // --- Daniel (Reviewer) requests changes -----------------------------------
  await switchTo(page, "Daniel");
  await openPlan(page, issue);

  await expect(
    toolbar(page).getByRole("button", { name: "Save Action Plan" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Generate Action Plan/ }),
  ).toHaveCount(0);

  const comment = "Please add a measurable KPI for kg of laundry per room.";
  await page.getByPlaceholder(/What needs to change/).fill(comment);
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(
    page.getByText("Changes requested by the reviewer"),
  ).toBeVisible();
  await expect(page.getByText(comment).first()).toBeVisible();

  // --- Maya sees the comment and revises; the request clears ----------------
  await switchTo(page, "Maya");
  await openPlan(page, issue);
  await expect(
    page.getByText("Changes requested by the reviewer"),
  ).toBeVisible();

  await openSection(page, /Operational Case Form/);
  await page.getByLabel(/^Priority/).selectOption("High");
  await toolbar(page).getByRole("button", { name: "Save Action Plan" }).click();
  await expect(page.getByText("Action plan saved.")).toBeVisible();
  await expect(page.getByText("Changes requested by the reviewer")).toHaveCount(
    0,
  );

  // --- Daniel approves; the plan locks --------------------------------------
  await switchTo(page, "Daniel");
  await openPlan(page, issue);
  await toolbar(page).getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText(/Approved by/)).toContainText("Daniel Ortiz");
  await expect(page.getByText(/approved and locked/).first()).toBeVisible();

  // --- Priya (Engineering) records KPI progress and notes -------------------
  await switchTo(page, "Priya");
  await openPlan(page, issue);

  await openSection(page, /KPI Progress/);
  await page.getByLabel("Baseline", { exact: true }).fill("120 kg/day");
  await page.getByLabel("Current", { exact: true }).fill("104 kg/day");
  await page.getByLabel("Target", { exact: true }).fill("100 kg/day");
  await page
    .getByLabel("Latest Update", { exact: true })
    .fill("Down 13% after the reuse briefing.");

  await openSection(page, /Action Notes/);
  await page
    .getByLabel("Implementation Progress Notes", { exact: true })
    .fill("Briefings delivered at every shift start for two weeks.");

  await toolbar(page).getByRole("button", { name: "Save Action Plan" }).click();
  await expect(page.getByText("Action plan saved.")).toBeVisible();

  // Priya cannot touch the plan itself, or approve.
  await openSection(page, /Operational Case Form/);
  await expect(page.getByLabel("Owner", { exact: true })).toBeDisabled();
  await expect(
    toolbar(page).getByRole("button", { name: "Approve" }),
  ).toHaveCount(0);
  await expect(
    toolbar(page).getByRole("button", { name: "Mark Done" }),
  ).toHaveCount(0);

  // --- Maya closes the plan out ---------------------------------------------
  await switchTo(page, "Maya");
  await openPlan(page, issue);
  await toolbar(page).getByRole("button", { name: "Mark Done" }).click();
  await expect(page.getByText("Done", { exact: true }).first()).toBeVisible();

  // --- the history names everyone, with the reviewer's comment --------------
  await openSection(page, /History/);
  const history = page.locator("ol");
  await expect(history).toContainText("Created");
  await expect(history).toContainText("Changes requested");
  await expect(history).toContainText(comment);
  await expect(history).toContainText("Daniel Ortiz · Reviewer");
  await expect(history).toContainText("Approved");
  await expect(history).toContainText("Priya Nair · Department Manager");
  await expect(history).toContainText("Marked done");
});

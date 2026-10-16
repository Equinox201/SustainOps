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

  // --- Maya works on the actions; editing alone does not answer the request --
  await switchTo(page, "Maya");
  await openPlan(page, issue);
  await expect(
    page.getByText("Changes requested by the reviewer"),
  ).toBeVisible();

  // Reword the first action, assign it, and add one of her own.
  const actions = page.getByTestId("action-item");
  await actions
    .first()
    .getByRole("textbox")
    .first()
    .fill("Set back unused floors by 22:00");
  await actions
    .first()
    .getByLabel("Assigned to")
    .selectOption({ label: "Priya Nair" });
  await page.getByRole("button", { name: "Add an action" }).click();
  await actions
    .last()
    .getByRole("textbox")
    .first()
    .fill("Brief night auditors on the floor setback routine");
  await expect(actions.last().getByText("Added by a person")).toBeVisible();
  await expect(actions.first().getByText("AI proposal, edited")).toBeVisible();

  await toolbar(page).getByRole("button", { name: "Save Action Plan" }).click();
  await expect(page.getByText("Action plan saved.")).toBeVisible();

  // The reviewer's request is still open: only a response closes it.
  await expect(
    page.getByText("Changes requested by the reviewer"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resubmit for review" }),
  ).toBeDisabled();
  await page
    .getByLabel("Your response")
    .fill("Added a measurable action and an owner.");
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(
    page.getByText("Resubmitted for review with your responses."),
  ).toBeVisible();
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

  // Priya owns the first action: she reports progress, she cannot rewrite it.
  const first = page.getByTestId("action-item").first();
  await expect(first.getByLabel("Assigned to")).toBeDisabled();
  await first.getByLabel("Progress").selectOption({ label: "Blocked" });
  await first
    .getByPlaceholder("Required while blocked")
    .fill("Waiting on the BMS vendor");

  await openSection(page, /KPI Progress/);
  await page.getByLabel("Baseline", { exact: true }).fill("120 kg/day");
  await page.getByLabel("Current", { exact: true }).fill("104 kg/day");
  await page.getByLabel("Target", { exact: true }).fill("100 kg/day");
  await page
    .getByLabel("Latest Update", { exact: true })
    .fill("Down 13% after the reuse briefing.");

  await toolbar(page).getByRole("button", { name: "Save Action Plan" }).click();
  await expect(page.getByText("Action plan saved.")).toBeVisible();

  // Notes are appended, attributed, and never edited.
  await openSection(page, /Action Notes/);
  await page
    .getByLabel("Add a note", { exact: true })
    .fill("Briefings delivered at every shift start for two weeks.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(
    page.getByText("Briefings delivered at every shift start for two weeks."),
  ).toBeVisible();

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
  const history = page.locator("ol").last();
  await expect(history).toContainText("Created");
  await expect(history).toContainText("Changes requested");
  await expect(history).toContainText(comment);
  await expect(history).toContainText("Daniel Ortiz · Reviewer");
  await expect(history).toContainText("Resubmitted for review");
  await expect(history).toContainText("Approved");
  await expect(history).toContainText("Priya Nair · Department Manager");
  await expect(history).toContainText("Note added");
  await expect(history).toContainText("Marked done");

  // Versions: what was approved is pinned, and what changed since is visible.
  await page.getByRole("button", { name: "Changes since approval" }).click();
  const comparison = page.getByRole("region", { name: "Compare versions" });
  await expect(comparison).toContainText("Progress Not started → Blocked");
  await expect(comparison).toContainText(
    "Blocked because — → Waiting on the BMS vendor",
  );
  await expect(comparison).toContainText("Done: no → yes");
});

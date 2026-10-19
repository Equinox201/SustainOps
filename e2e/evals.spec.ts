import { expect, test } from "@playwright/test";

test.describe("evaluation page", () => {
  test("is public and shows measured results with their limits", async ({
    page,
  }) => {
    await page.goto("/evals");

    await expect(
      page.getByRole("heading", { name: /Is it actually grounded/ }),
    ).toBeVisible();
    await expect(page.getByText(/cases passed every hard check/)).toBeVisible();

    // Hard-zero metrics and the caveats are part of the page, not an afterthought.
    await expect(page.getByText("Forbidden-document leakage")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /How far to trust this/ }),
    ).toBeVisible();
    await expect(page.getByText(/95% CI/).first()).toBeVisible();

    // The counterfactual shows the decision following the policy, with its caveats.
    const counterfactual = page.getByRole("region", {
      name: "Does retrieval change the decision",
    });
    await expect(counterfactual).toContainText(
      "Updated policy (Energy SOP v3)",
    );
    await expect(counterfactual).toContainText("Hold off: 3 of 3");
    await expect(counterfactual).toContainText("Consolidate now: 3 of 3");
    await expect(counterfactual).toContainText("45%");
    await expect(counterfactual).toContainText("30%");
    await expect(
      counterfactual.getByRole("heading", {
        name: /Limits of this demonstration/,
      }),
    ).toBeVisible();

    // Every benchmark case is listed with a verdict.
    await expect(
      page.getByRole("columnheader", { name: "Result" }),
    ).toBeVisible();
    await expect(page.getByText("hk-trap-escalation")).toBeVisible();
  });
});

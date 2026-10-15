import { expect, type Page } from "@playwright/test";

export type Persona = "Maya" | "Daniel" | "Priya" | "Tom";

/** Signs in from the persona picker (the app starts signed out). */
export async function signInAs(page: Page, persona: Persona) {
  await page.goto("/");
  await page
    .getByRole("button", { name: new RegExp(`Continue as ${persona}`) })
    .click();
  await expect(page.getByRole("button", { name: "Switch user" })).toBeVisible();
}

/** Leaves the editor if open, then switches to another persona. */
export async function switchTo(page: Page, persona: Persona) {
  const back = page.getByRole("button", { name: "Back to Action Plans" });

  if (await back.isVisible()) {
    await back.click();
  }

  await page.getByRole("button", { name: "Switch user" }).click();
  await page
    .getByRole("button", { name: new RegExp(`Continue as ${persona}`) })
    .click();
  await expect(page.getByRole("button", { name: "Switch user" })).toBeVisible();
}

/** Opens the plan whose card mentions `text`. */
export async function openPlan(page: Page, text: string) {
  await page
    .locator("article", { hasText: text })
    .getByRole("button", { name: "View / Edit" })
    .click();
  await expect(page.getByText("Action Plan Editor")).toBeVisible();
}

export function toolbar(page: Page) {
  return page.locator("div.sticky");
}

/** Expands an editor section by its heading, e.g. "KPI Progress". */
export async function openSection(page: Page, title: RegExp | string) {
  await page.getByRole("button", { name: title }).click();
}

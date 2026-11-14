import { test, expect, type Locator, type Page } from "@playwright/test";
import { READY_TO_ASSIGN } from "../src/lib/readyToAssign";

// Move Money to and from Ready to Assign (#217, #134). Specs share one
// seeded database and earlier ones assign money too, so every check is a
// difference: Ready to Assign and the category move by the same amount in
// opposite directions.

function utcMonthKey(offset: number) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "$1,234.56" / "-$40.00" → cents. */
function cents(text: string): number {
  const negative = /^[-−]/.test(text.trim());
  const value = Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);
  return negative ? -value : value;
}

function pill(page: Page): Locator {
  return page.getByRole("button", { name: /Ready to Assign|All Money Assigned|You assigned more than you have/ });
}

async function readyToAssign(page: Page) {
  return cents((await pill(page).locator("bdi").first().textContent()) ?? "");
}

function availableButton(page: Page, category: string) {
  return page
    .getByText(category, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]")
    .getByTitle("Move money");
}

async function available(page: Page, category: string) {
  return cents((await availableButton(page, category).textContent()) ?? "");
}

test.describe("Move Money with Ready to Assign", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/budget?month=${utcMonthKey(0)}`);
  });

  test("the drawer's Assign money form funds a category from Ready to Assign", async ({ page }) => {
    const [rtaBefore, groceriesBefore] = [await readyToAssign(page), await available(page, "Groceries")];

    await pill(page).click();
    const form = page.getByRole("form", { name: "Assign money" });
    await form.getByLabel("Amount").fill("12.50");
    const to = form.getByLabel("To");
    await to.selectOption((await to.locator("option", { hasText: "Groceries" }).getAttribute("value"))!);
    await expect(form.getByText("Ready to Assign after")).toBeVisible();
    await form.getByRole("button", { name: "Assign" }).click();

    await expect.poll(() => readyToAssign(page)).toBe(rtaBefore - 1_250);
    expect(await available(page, "Groceries")).toBe(groceriesBefore + 1_250);
  });

  test("a category can pull money in from Ready to Assign, and move it back", async ({ page }) => {
    const [rtaBefore, utilitiesBefore] = [await readyToAssign(page), await available(page, "Utilities")];

    // Into Utilities, from Ready to Assign.
    await availableButton(page, "Utilities").click();
    let popover = page.getByRole("dialog", { name: "Move money for Utilities" });
    await popover.getByRole("radio", { name: /^Into/ }).click();
    await popover.getByLabel("Amount").fill("8");
    await popover.getByLabel("From").selectOption(READY_TO_ASSIGN);
    await popover.getByRole("button", { name: "Move" }).click();

    await expect.poll(() => available(page, "Utilities")).toBe(utilitiesBefore + 800);
    expect(await readyToAssign(page)).toBe(rtaBefore - 800);

    // Out of Utilities, back to Ready to Assign: both figures return.
    await availableButton(page, "Utilities").click();
    popover = page.getByRole("dialog", { name: "Move money for Utilities" });
    await popover.getByLabel("Amount").fill("8");
    await popover.getByLabel("To").selectOption(READY_TO_ASSIGN);
    await popover.getByRole("button", { name: "Move" }).click();

    await expect.poll(() => available(page, "Utilities")).toBe(utilitiesBefore);
    expect(await readyToAssign(page)).toBe(rtaBefore);
  });
});

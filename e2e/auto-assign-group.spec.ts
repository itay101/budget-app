import { test, expect, type Page } from "@playwright/test";

/**
 * Auto-Assign from a category group's header (#219, #147): Reset Assigned on
 * the seeded "Immediate Obligations" group frees what's assigned there, and
 * Undo puts it back. Every check is a difference, since specs share one
 * seeded database.
 */

function cents(text: string): number {
  const value = Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);
  return /^[-−]/.test(text.trim()) ? -value : value;
}

async function available(page: Page, category: string) {
  const text = await page
    .getByText(category, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]")
    .getByTitle("Move money")
    .textContent();
  return cents(text ?? "");
}

async function assigned(page: Page, category: string) {
  const value = await page
    .getByText(category, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]")
    .locator('input[type="number"]')
    .inputValue();
  return Math.round(Number(value) * 100);
}

test("a group's Reset Assigned frees what's assigned in that group, and Undo puts it back", async ({ page }) => {
  await page.goto("/budget");
  const groceries = { available: await available(page, "Groceries"), assigned: await assigned(page, "Groceries") };

  await page.getByRole("button", { name: "Auto-Assign Immediate Obligations" }).click();
  const menu = page.getByRole("dialog", { name: "Auto-Assign Immediate Obligations" });
  await menu.getByRole("button", { name: /^Reset Assigned/ }).click();
  const preview = menu.getByRole("region", { name: "Auto-Assign Reset Assigned preview" });
  await expect(preview.getByRole("listitem").filter({ hasText: "Groceries" })).toContainText("→ $0.00");
  await preview.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByRole("status").filter({ hasText: /^Freed \$/ })).toBeVisible();
  await expect.poll(() => available(page, "Groceries")).toBe(groceries.available - groceries.assigned);
  expect(await assigned(page, "Groceries")).toBe(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => available(page, "Groceries")).toBe(groceries.available);
  await expect(page.getByRole("status").filter({ hasText: /^Undid \d+ changes?/ })).toBeVisible();
});

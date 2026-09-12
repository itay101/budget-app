import { test, expect, type Page } from "@playwright/test";

/**
 * Locates a category (or category group) row by its visible name, then
 * walks up to the row's shared grid container so a caller can query
 * within just that row - e.g. its Budgeted input, without matching the
 * same-shaped fields on every other category on the page.
 */
function rowContaining(page: Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]");
}

test.describe("budget page", () => {
  test("creating a category group and category, then budgeting it, updates Available", async ({
    page,
  }) => {
    await page.goto("/budget");

    // Exact match: the sidebar's own "Add account" button and, once a
    // popover is open, its "Add category group"/"Add category" submit
    // button would otherwise also match a plain substring "Add". The
    // budget table header's "+ Add" (there's also one per category
    // group, for adding a category) is the first exact "Add" on the page.
    const addToggle = page.getByRole("button", { name: "Add", exact: true });
    await addToggle.first().click();
    await page.getByLabel("Name").fill("E2E Savings");
    await page.getByRole("button", { name: "Add category group" }).click();

    await expect(page.getByText("E2E Savings")).toBeVisible();

    // The new group is appended after every existing one, so its own
    // "+ Add" (for a category) is now the last exact "Add" on the page.
    await addToggle.last().click();
    await page.getByLabel("Name").fill("Emergency Fund");
    await page.getByRole("button", { name: "Add category" }).click();

    const row = rowContaining(page, "Emergency Fund");
    await expect(row).toBeVisible();

    await row.locator('input[type="number"]').fill("50");
    await row.getByTitle("Save").click();

    // No activity yet, so Available should track Budgeted exactly.
    await expect(row.getByText("$50.00")).toBeVisible();
  });
});

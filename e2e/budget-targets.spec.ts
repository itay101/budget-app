import { test, expect, type Page } from "@playwright/test";

/** A category row's grid, as in budget.spec.ts. */
function rowContaining(page: Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]");
}

/** A quick filter's link, e.g. "Underfunded 3". */
function quickFilter(page: Page, label: string) {
  return page.getByRole("navigation", { name: "Quick filters" }).getByRole("link", { name: new RegExp(`^${label} \\d+$`) });
}

/** Every category row the table shows: each has one drag handle. */
function shownRows(page: Page) {
  return page.getByTitle("Drag to reorder or move to another group");
}

/** A quick filter's count equals the rows it shows. */
async function expectCountMatchesRows(page: Page, label: string) {
  const text = await quickFilter(page, label).textContent();
  await expect(shownRows(page)).toHaveCount(Number(text?.match(/\d+$/)?.[0]));
}

test.describe("category targets on the budget page (#171)", () => {
  test("set a target, see it underfunded, assign, see it funded, snooze it, filter by Underfunded", async ({
    page,
  }) => {
    await page.goto("/budget");

    // Into the seeded group (the table header's "+ Add" is the first exact
    // "Add"; the first group's is the second), so this spec doesn't add a
    // group that would lengthen the page for the specs after it.
    await page.getByRole("button", { name: "Add", exact: true }).nth(1).click();
    await page.getByLabel("Name", { exact: true }).fill("Target Practice");
    await page.getByRole("button", { name: "Add category" }).click();

    const row = rowContaining(page, "Target Practice");
    await expect(row).toBeVisible();

    // Set a monthly Set aside target of $120 (the editor's defaults).
    await row.getByRole("button", { name: "Add target" }).click();
    const editor = page.getByRole("form", { name: "Target" });
    await editor.getByLabel("Amount").fill("120");
    await editor.getByRole("button", { name: "Save target" }).click();
    await expect(editor).toHaveCount(0);

    // Nothing assigned yet: underfunded by the whole amount.
    await expect(row.getByText(/\$120\.00.* more/)).toBeVisible();
    await expect(page.getByText(/still needed across/)).toBeVisible();
    await quickFilter(page, "Underfunded").click();
    await expect(page).toHaveURL(/filter=underfunded/);
    await expect(rowContaining(page, "Target Practice")).toBeVisible();
    await expectCountMatchesRows(page, "Underfunded");

    // Assign it in full: funded.
    await quickFilter(page, "All").click();
    await row.locator('input[type="number"]').fill("120");
    await row.getByTitle("Save").click();
    await expect(row.getByText("Funded", { exact: true })).toBeVisible();

    // Snooze it for this month.
    await row.getByRole("button", { name: /^Edit target/ }).click();
    await editor.getByRole("button", { name: /^Snooze for / }).click();
    await expect(row.getByText("Snoozed", { exact: true })).toBeVisible();
    await quickFilter(page, "Snoozed").click();
    await expect(rowContaining(page, "Target Practice")).toBeVisible();
    await expectCountMatchesRows(page, "Snoozed");

    // Funded and snoozed, it's no longer underfunded.
    await quickFilter(page, "Underfunded").click();
    await expect(page.getByText("Target Practice", { exact: true })).toHaveCount(0);
    await expectCountMatchesRows(page, "Underfunded");
  });
});

import { test, expect, type Page } from "@playwright/test";

// ADR 0009 rollover (#168), against the seed: last month Utilities spent
// $40 with nothing assigned; this month it has $150 assigned and no
// spending, and Groceries has $500 assigned with $84.99 spent.
function utcMonthKey(offset: number) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function availableIn(page: Page, category: string) {
  return page
    .getByText(category, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]")
    .getByTitle("Move money");
}

test.describe("overspending rollover", () => {
  test("an overspent category shows negative in its month and starts the next month at zero", async ({
    page,
  }) => {
    await page.goto(`/budget?month=${utcMonthKey(-1)}`);
    await expect(availableIn(page, "Utilities")).toHaveText("-$40.00");

    // Not $110: last month's -$40 doesn't carry into this month.
    await page.goto(`/budget?month=${utcMonthKey(0)}`);
    await expect(availableIn(page, "Utilities")).toHaveText("$150.00");
  });

  test("a positive balance carries forward into the next month", async ({ page }) => {
    await page.goto(`/budget?month=${utcMonthKey(1)}`);
    await expect(availableIn(page, "Groceries")).toHaveText("$415.01");
  });
});

import { test, expect, type Page } from "@playwright/test";

// Month navigation on /budget (#124, #167). Budget Months are UTC, so the
// expected labels and URL keys are computed the same way here.
function utcMonth(offset: number) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return {
    key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    label: d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
  };
}

function rowContaining(page: Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]");
}

const monthButton = (page: Page) => page.getByRole("button", { name: /^[A-Z][a-z]{2} \d{4}/ });

test.describe("budget month navigation", () => {
  test("opens on the current UTC month, and assigning in another month stays in that month", async ({
    page,
  }) => {
    const current = utcMonth(0);
    const next = utcMonth(1);

    await page.goto("/budget");
    await expect(monthButton(page)).toHaveText(new RegExp(current.label));
    await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0);

    await page.getByRole("link", { name: "Next month" }).click();
    await expect(page).toHaveURL(new RegExp(`month=${next.key}`));
    await expect(monthButton(page)).toHaveText(new RegExp(next.label));

    // Seeded Utilities has $150 assigned in the current month only.
    const utilities = rowContaining(page, "Utilities");
    await expect(utilities.locator('input[type="number"]')).toHaveValue("0");
    await utilities.locator('input[type="number"]').fill("25");
    await utilities.getByTitle("Save").click();
    await expect(utilities.locator('input[type="number"]')).toHaveValue("25");

    await page.getByRole("link", { name: `Back to ${current.label}` }).click();
    await expect(page).toHaveURL(new RegExp(`month=${current.key}`));
    await expect(rowContaining(page, "Utilities").locator('input[type="number"]')).toHaveValue("150");
  });

  test("redirects an out-of-range month and ignores a malformed one", async ({ page }) => {
    const current = utcMonth(0);

    // Far in the future: clamps to the last navigable month.
    await page.goto("/budget?month=2999-01");
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
    expect(page.url()).not.toContain("2999-01");

    await page.goto("/budget?month=not-a-month");
    await expect(monthButton(page)).toHaveText(new RegExp(current.label));
  });

  test("the month picker marks the viewed month and jumps to another", async ({ page }) => {
    const current = utcMonth(0);
    const next = utcMonth(1);

    await page.goto("/budget");
    await monthButton(page).click();
    const picker = page.getByRole("dialog", { name: "Choose a month" });
    await expect(picker).toBeVisible();
    await expect(picker.locator('[aria-current="date"]')).toHaveText(current.label.slice(0, 3));

    if (next.key.slice(0, 4) !== current.key.slice(0, 4)) {
      await picker.getByRole("button", { name: "Next year" }).click();
    }
    await picker.getByRole("link", { name: next.label.slice(0, 3), exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`month=${next.key}`));
  });

  test("a category's Activity links to its transactions for the viewed month", async ({ page }) => {
    const current = utcMonth(0);

    await page.goto("/budget");
    await rowContaining(page, "Groceries").getByTitle("Show this month's transactions").click();
    await expect(page).toHaveURL(/\/accounts\/all\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("category")).toBeTruthy();
    expect(url.searchParams.get("from")).toBe(`${current.key}-01`);
    expect(url.searchParams.get("to")).toMatch(new RegExp(`^${current.key}-\\d{2}$`));
  });
});

import { test, expect, type Locator, type Page } from "@playwright/test";

// Ready to Assign (#121, ADR 0008/0009) against the seed:
// - income: Checking's $1,624.99 Starting Balance this month, categorized
//   Inflow: Ready to Assign;
// - overspend: last month Utilities spent $40 with nothing assigned.
// Specs share one database and earlier ones assign money too, so totals
// are checked as differences, not as fixed figures.

function utcMonthKey(offset: number) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthName(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "$1,234.56" / "-$40.00" / "−$40.00" → cents. */
function cents(text: string): number {
  const negative = /^[-−]/.test(text.trim());
  const value = Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);
  return negative ? -value : value;
}

function pill(page: Page): Locator {
  return page.getByRole("button", { name: /Ready to Assign|All Money Assigned|You assigned more than you have/ });
}

async function pillCents(page: Page): Promise<number> {
  const amount = (await pill(page).locator("bdi").first().textContent()) ?? "";
  return cents(amount);
}

function rowContaining(page: Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]");
}

test.describe("Ready to Assign", () => {
  test("the drawer's Breakdown shows income and last month's overspending, and adds up to the pill", async ({
    page,
  }) => {
    await page.goto(`/budget?month=${utcMonthKey(0)}`);
    const total = await pillCents(page);

    await pill(page).click();
    const drawer = page.getByRole("dialog", { name: monthName(0) });
    await expect(drawer).toBeVisible();

    const lines = drawer.locator("dl > div");
    await expect(lines.nth(1)).toHaveText(`Inflow: Ready to Assign in ${monthName(0)}+$1,624.99`);
    await expect(lines.nth(2)).toHaveText(`Cash overspending in ${monthName(-1)}−$40.00`);

    // Each signed line, summed, is the total shown.
    let sum = 0;
    for (const text of await lines.locator("dd").allTextContents()) {
      const sign = text.startsWith("−") ? -1 : 1;
      if (text.startsWith("=")) {
        expect(cents(text.slice(1))).toBe(total);
      } else {
        sum += sign * cents(text.slice(1));
      }
    }
    expect(sum).toBe(total);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("assigning money to a category lowers Ready to Assign by the same amount, and un-assigning raises it", async ({
    page,
  }) => {
    await page.goto(`/budget?month=${utcMonthKey(0)}`);
    const before = await pillCents(page);
    const row = rowContaining(page, "Rent/Mortgage");
    const input = row.locator('input[type="number"]');
    const assigned = Number(await input.inputValue());

    await input.fill(String(assigned + 25));
    await row.getByTitle("Save").click();
    await expect.poll(() => pillCents(page)).toBe(before - 2_500);

    await input.fill(String(assigned));
    await row.getByTitle("Save").click();
    await expect.poll(() => pillCents(page)).toBe(before);
  });

  test("money assigned to next month comes out of this month straight away", async ({ page }) => {
    await page.goto(`/budget?month=${utcMonthKey(0)}`);
    const thisMonthBefore = await pillCents(page);

    await page.goto(`/budget?month=${utcMonthKey(1)}`);
    const nextMonthBefore = await pillCents(page);
    const row = rowContaining(page, "Utilities");
    const input = row.locator('input[type="number"]');
    const assigned = Number(await input.inputValue());
    await input.fill(String(assigned + 10));
    await row.getByTitle("Save").click();
    // Saved once next month's own figure has dropped too.
    await expect.poll(() => pillCents(page)).toBe(nextMonthBefore - 1_000);

    await page.goto(`/budget?month=${utcMonthKey(0)}`);
    expect(await pillCents(page)).toBe(thisMonthBefore - 1_000);
  });
});

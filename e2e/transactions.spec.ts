import { test, expect } from "@playwright/test";

test.describe("transactions", () => {
  test("adding a transaction on an account shows up in its list", async ({
    page,
  }) => {
    await page.goto("/budget");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Checking" }).click();

    await page.getByRole("button", { name: "Add Transaction" }).click();

    // Every existing transaction row is itself an always-editable set of
    // inputs (see TransactionRow in TransactionsTable.tsx), each carrying
    // the same placeholders as the new-row form below - so a bare
    // getByPlaceholder("Payee") matches every row, not just the new one.
    // NewTransactionRow is rendered above the existing rows, and
    // "Save and add another" only ever appears in it, so it's a reliable
    // anchor to scope down to just this row.
    const newRow = page
      .getByRole("button", { name: "Save and add another" })
      .locator("xpath=ancestor::div[contains(@class,'bg-brand-700/5')][1]");

    await newRow.getByPlaceholder("Payee").fill("E2E Coffee Shop");
    await newRow.getByPlaceholder("Memo").fill("E2E test transaction");
    // Outflow, not Inflow - both share the "0.00" placeholder, so they're
    // told apart by the color class NewTransactionRow gives each.
    await newRow
      .locator('input[placeholder="0.00"][class*="text-danger"]')
      .fill("12.34");

    await newRow.getByRole("button", { name: "Save", exact: true }).click();

    // The saved row re-renders as a plain (freshly server-rendered)
    // TransactionRow - a CSS attribute selector reads its value, same as
    // e2e/smoke.spec.ts's valueField helper (no getByDisplayValue in
    // Playwright).
    await expect(page.locator('input[value="E2E Coffee Shop"]')).toBeVisible();
    await expect(page.locator('input[value="12.34"]')).toBeVisible();
  });

  test("entering a payee with a remembered category auto-fills that category (#88)", async ({
    page,
  }) => {
    await page.goto("/budget");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Checking" }).click();

    await page.getByRole("button", { name: "Add Transaction" }).click();

    const newRow = page
      .getByRole("button", { name: "Save and add another" })
      .locator("xpath=ancestor::div[contains(@class,'bg-brand-700/5')][1]");

    // prisma/seed.ts already has a "Grocery Store" transaction categorized
    // as "Groceries" - typing that same payee name into a brand-new row
    // should default its category to "Groceries" without the category
    // select being touched at all.
    await newRow.getByPlaceholder("Payee").fill("Grocery Store");

    await expect(newRow.locator("select option:checked")).toHaveText(
      "Groceries",
    );

    // A category the user picked explicitly is never overridden - re-typing
    // the same payee (any edit re-fires the payee's onChange) after
    // manually switching the category away from the auto-filled one should
    // leave that explicit choice alone rather than re-defaulting it back to
    // "Groceries".
    await newRow.locator("select").selectOption({ label: "Rent/Mortgage" });
    await newRow.getByPlaceholder("Payee").fill("Grocery Store ");
    await newRow.getByPlaceholder("Payee").fill("Grocery Store");
    await expect(newRow.locator("select option:checked")).toHaveText(
      "Rent/Mortgage",
    );
  });
});

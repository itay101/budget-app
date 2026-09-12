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
});

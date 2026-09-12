import { test, expect } from "@playwright/test";

test.describe("transactions", () => {
  test("adding a transaction on an account shows up in its list", async ({
    page,
  }) => {
    await page.goto("/budget");
    await page.getByRole("link", { name: "Checking" }).click();

    await page.getByRole("button", { name: "Add Transaction" }).click();

    await page.getByPlaceholder("Payee").fill("E2E Coffee Shop");
    await page.getByPlaceholder("Memo").fill("E2E test transaction");
    // Outflow, not Inflow - both share the "0.00" placeholder, so they're
    // told apart by the color class NewTransactionRow gives each.
    await page
      .locator('input[placeholder="0.00"][class*="text-danger"]')
      .fill("12.34");

    await page.getByRole("button", { name: "Save", exact: true }).click();

    const row = page.getByText("E2E Coffee Shop");
    await expect(row).toBeVisible();
    await expect(page.getByText("-$12.34")).toBeVisible();
  });
});

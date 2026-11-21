import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { ON_BUDGET_LOCKED_MESSAGE } from "../src/lib/transfers";

/**
 * Account-to-account transfers (ADR 0007, #223). The savings account is
 * removed afterwards, and its transactions go with it, so the seeded
 * Checking and Credit Card lists stay as the other specs left them.
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
const SAVINGS_NAME = "E2E Transfer Savings";

test.describe("account transfers", () => {
  test.afterAll(async () => {
    await prisma.account.deleteMany({ where: { name: SAVINGS_NAME } });
    await prisma.$disconnect();
  });

  test("locks on-budget once an account has a transaction, and says why", async ({ page }) => {
    await page.goto("/accounts");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(ON_BUDGET_LOCKED_MESSAGE)).toBeVisible();
    const locked = page.getByRole("checkbox", { name: "On budget" });
    await expect(locked.first()).toBeDisabled();
  });

  test("creating a transfer adds both sides, and deleting one removes both", async ({ page }) => {
    page.on("dialog", (dialog) => {
      const message = dialog.message();
      if (message.startsWith("Delete this transfer")) {
        return dialog.accept();
      }
      // Cancel keeps the save going and creates a new row. A match here
      // would mean the link window caught a seeded transaction.
      if (message.includes("Link it instead")) {
        return dialog.dismiss();
      }
      return dialog.accept();
    });

    await page.goto("/budget");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Add account" }).click();
    const form = page.locator("form").filter({ has: page.locator("#new-account-name") });
    await form.getByLabel("Name", { exact: true }).fill(SAVINGS_NAME);
    await form.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByRole("heading", { name: SAVINGS_NAME })).toBeVisible();

    await page.getByRole("button", { name: "Add Transaction" }).click();
    const newRow = page
      .getByRole("button", { name: "Save and add another" })
      .locator("xpath=ancestor::div[contains(@class,'bg-brand-700/5')][1]");
    await newRow.getByPlaceholder("Payee").fill("Transfer: Checking");
    await newRow.getByPlaceholder("Memo").fill("E2E transfer");
    await newRow.locator('input[placeholder="0.00"][class*="text-danger"]').fill("15.00");
    await newRow.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.locator('input[value="Transfer: Checking"]')).toBeVisible();
    await expect(page.locator('input[value="15.00"]')).toBeVisible();

    await page.getByRole("link", { name: "Checking" }).click();
    await expect(page.getByRole("heading", { name: "Checking" })).toBeVisible();
    const inflow = page.locator('input[value="Transfer: E2E Transfer Savings"]');
    await expect(inflow).toBeVisible();

    const transferRow = page.locator("div.border-b").filter({ has: inflow });
    await transferRow.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(inflow).toHaveCount(0);

    await page.getByRole("link", { name: SAVINGS_NAME }).click();
    await expect(page.getByRole("heading", { name: SAVINGS_NAME })).toBeVisible();
    await expect(page.locator('input[value="Transfer: Checking"]')).toHaveCount(0);
  });
});

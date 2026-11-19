import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * A card purchase and its payment (ADR 0010, #224). The card and the
 * rows this spec adds are removed afterwards, and Checking's cached
 * balance is put back, so later specs still see the seed.
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
const CARD = "E2E Visa";

function availableIn(page: Page, category: string) {
  return page
    .locator("main")
    .getByText(category, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]")
    .getByTitle("Move money");
}

test.describe("credit card payment category", () => {
  let checkingBalance = 0;

  test.beforeAll(async () => {
    const checking = await prisma.account.findFirstOrThrow({ where: { name: "Checking" } });
    checkingBalance = checking.balance;
  });

  test.afterAll(async () => {
    const card = await prisma.account.findFirst({ where: { name: CARD } });
    if (card) {
      const rows = await prisma.transaction.findMany({
        where: { accountId: card.id },
        select: { id: true, transferTransactionId: true },
      });
      const ids = rows.flatMap((row) => [row.id, row.transferTransactionId].filter((id): id is string => id != null));
      if (ids.length > 0) {
        await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { transferTransactionId: null } });
        await prisma.transaction.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.account.delete({ where: { id: card.id } });
    }
    await prisma.categoryGroup.deleteMany({
      where: { systemKind: "CREDIT_CARD_PAYMENTS", categories: { none: {} } },
    });
    await prisma.account.updateMany({ where: { name: "Checking" }, data: { balance: checkingBalance } });
    await prisma.$disconnect();
  });

  test("a covered card purchase funds its Payment Category, and paying the card spends that", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.dismiss());

    await page.goto("/budget");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Add account" }).click();
    const form = page.locator("form").filter({ has: page.locator("#new-account-name") });
    await form.getByLabel("Name", { exact: true }).fill(CARD);
    await form.locator("#new-account-type").selectOption("CREDIT_CARD");
    await form.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByRole("heading", { name: CARD })).toBeVisible();

    await page.getByRole("button", { name: "Add Transaction" }).click();
    const purchase = page
      .getByRole("button", { name: "Save and add another" })
      .locator("xpath=ancestor::div[contains(@class,'bg-brand-700/5')][1]");
    await purchase.getByPlaceholder("Payee").fill("E2E Cafe");
    await expect(purchase.locator("option", { hasText: CARD })).toHaveCount(0);
    await purchase.locator("select").selectOption({ label: "Groceries" });
    await purchase.locator('input[placeholder="0.00"][class*="text-danger"]').fill("25.00");
    await purchase.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator('input[value="E2E Cafe"]')).toBeVisible();

    await page.goto("/budget");
    await expect(page.locator("main").getByText("Credit Card Payments")).toBeVisible();
    await expect(availableIn(page, CARD)).toHaveText("$25.00");

    await page.getByRole("link", { name: "Checking" }).click();
    await expect(page.getByRole("heading", { name: "Checking" })).toBeVisible();
    await page.getByRole("button", { name: "Add Transaction" }).click();
    const payment = page
      .getByRole("button", { name: "Save and add another" })
      .locator("xpath=ancestor::div[contains(@class,'bg-brand-700/5')][1]");
    await payment.getByPlaceholder("Payee").fill(`Transfer: ${CARD}`);
    await payment.locator('input[placeholder="0.00"][class*="text-danger"]').fill("25.00");
    await payment.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(`input[value="Transfer: ${CARD}"]`)).toBeVisible();

    await page.goto("/budget");
    await expect(availableIn(page, CARD)).toHaveText("$0.00");
  });
});

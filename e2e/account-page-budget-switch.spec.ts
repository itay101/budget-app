import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

/**
 * #204: the current budget lives in a cookie, not the URL, so switching
 * budgets while on an account page re-renders that same /accounts/<id>
 * against the newly selected budget. An account from the budget you just
 * left should land you on the new budget's accounts list, not a 404.
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

test.describe("account page after switching budgets", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("an account from the previous budget redirects to the accounts list", async ({ page }) => {
    const activeBudget = await prisma.budget.findFirstOrThrow({
      where: { ownerId: E2E_TEST_USER_ID, deleted: false },
      orderBy: { createdAt: "asc" },
    });
    const otherBudget = await prisma.budget.create({
      data: { name: "E2E Switch Target", currency: "CAD", ownerId: E2E_TEST_USER_ID },
    });
    const account = await prisma.account.create({
      data: { budgetId: activeBudget.id, name: "E2E Switch Checking" },
    });

    try {
      await page.goto(`/accounts/${account.id}`);
      await expect(page.getByRole("heading", { name: account.name })).toBeVisible();

      await page.getByRole("button", { name: new RegExp(activeBudget.name) }).click();
      await page.getByRole("button", { name: otherBudget.name, exact: true }).click();

      await expect(page).toHaveURL(/\/accounts$/);
      await expect(page.getByText("This page could not be found.")).toHaveCount(0);
    } finally {
      await prisma.account.delete({ where: { id: account.id } });
      await prisma.budget.delete({ where: { id: otherBudget.id } });
    }
  });

  test("an unknown account id still 404s", async ({ page }) => {
    await page.goto("/accounts/no-such-account-id");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});

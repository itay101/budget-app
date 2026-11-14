import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * #195: creating an account from the sidebar's "+ Add account" popover
 * opens the new account's page, instead of leaving you where you were.
 * The account is deleted afterwards (its Starting Balance transaction
 * cascades with it) so the read-only smoke checks still see only the
 * seeded accounts.
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
const ACCOUNT_NAME = "E2E Navigate Savings";

test.describe("adding an account from the sidebar", () => {
  test.afterAll(async () => {
    await prisma.account.deleteMany({ where: { name: ACCOUNT_NAME } });
    await prisma.$disconnect();
  });

  test("opens the new account's page", async ({ page }) => {
    await page.goto("/budget");
    // The popover's trigger is a client component; let it hydrate first.
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Add account" }).click();
    const form = page.locator("form").filter({ has: page.locator("#new-account-name") });
    await form.getByLabel("Name", { exact: true }).fill(ACCOUNT_NAME);
    await form.getByRole("button", { name: "Add account" }).click();

    await expect(page).toHaveURL(/\/accounts\/[^/]+$/);
    await expect(page.getByRole("heading", { name: ACCOUNT_NAME })).toBeVisible();

    const created = await prisma.account.findFirstOrThrow({
      where: { name: ACCOUNT_NAME },
    });
    expect(new URL(page.url()).pathname).toBe(`/accounts/${created.id}`);
  });
});

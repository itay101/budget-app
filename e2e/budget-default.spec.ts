import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

/**
 * #189: a user can mark one of their Budgets as their default, which
 * getCurrentBudget lands them on when there's no current-budget cookie
 * (after signing out, or on a new device). Setting it doesn't switch
 * budgets, and a default that's since been deleted falls back silently to
 * the oldest accessible Budget.
 *
 * Uses its own CHF budget so the seeded "My Budget" stays the oldest one,
 * and resets the user's default afterwards so other specs still land on
 * the seeded budget.
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const DEFAULT_NAME = "E2E Default Budget";

/** The switcher's header button, which shows the current budget's name
 * followed by its currency symbol in parentheses. */
function switcherHeader(page: Page, budgetName: string) {
  return page.getByRole("button", { name: new RegExp(`^${budgetName} \\(`) });
}

/** Simulates a fresh sign-in or new device: no current-budget cookie. */
async function dropCurrentBudgetCookie(page: Page) {
  await page.context().clearCookies({ name: "budgetId" });
}

test.describe("default budget", () => {
  test.afterAll(async () => {
    await prisma.user.update({
      where: { id: E2E_TEST_USER_ID },
      data: { defaultBudgetId: null },
    });
    await prisma.budget.deleteMany({ where: { name: DEFAULT_NAME } });
    await prisma.$disconnect();
  });

  test("a user can set a default budget, lands on it without a cookie, and falls back when it's deleted", async ({
    page,
  }) => {
    const oldest = await prisma.budget.findFirstOrThrow({
      where: { ownerId: E2E_TEST_USER_ID, deleted: false },
      orderBy: { createdAt: "asc" },
    });
    const preferred = await prisma.budget.create({
      data: { name: DEFAULT_NAME, currency: "CHF", ownerId: E2E_TEST_USER_ID },
    });

    await dropCurrentBudgetCookie(page);
    await page.goto("/budget");
    await expect(switcherHeader(page, oldest.name)).toBeVisible();

    // Mark the new budget as the default. The current budget stays put.
    await switcherHeader(page, oldest.name).click();
    const star = page.getByRole("button", { name: `Set ${DEFAULT_NAME} as your default budget` });
    await star.click();
    await expect(
      page.getByRole("button", { name: `${DEFAULT_NAME} is your default budget. Click to clear it.` }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(switcherHeader(page, oldest.name)).toBeVisible();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: E2E_TEST_USER_ID } })).defaultBudgetId,
    ).toBe(preferred.id);

    // With no cookie, the user lands on their default.
    await dropCurrentBudgetCookie(page);
    await page.goto("/budget");
    await expect(switcherHeader(page, DEFAULT_NAME)).toBeVisible();

    // Clicking the filled star clears the default again.
    await switcherHeader(page, DEFAULT_NAME).click();
    await page
      .getByRole("button", { name: `${DEFAULT_NAME} is your default budget. Click to clear it.` })
      .click();
    await expect(star).toHaveAttribute("aria-pressed", "false");
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: E2E_TEST_USER_ID } })).defaultBudgetId,
    ).toBeNull();

    // A default that's since been deleted falls back to the oldest budget.
    await prisma.user.update({
      where: { id: E2E_TEST_USER_ID },
      data: { defaultBudgetId: preferred.id },
    });
    await prisma.budget.update({ where: { id: preferred.id }, data: { deleted: true } });
    await dropCurrentBudgetCookie(page);
    await page.goto("/budget");
    await expect(switcherHeader(page, oldest.name)).toBeVisible();
  });
});

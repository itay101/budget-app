import { test, expect, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { currentBudgetMonth } from "../src/lib/budgetMonth";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

// Next-Month Warning (#226, #183). The seed's Ready to Assign is negative
// and nothing is cash-overspent this month, so this spec adds the income
// and the outflow that make the settled example ($50 left, $200 overspent,
// next month −$150), then puts both back.

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

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

function dollars(centsValue: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(centsValue / 100);
}

function pill(page: Page): Locator {
  return page.getByRole("button", { name: /Ready to Assign|All Money Assigned|You assigned more than you have/ });
}

async function pillCents(page: Page): Promise<number> {
  return cents((await pill(page).locator("bdi").first().textContent()) ?? "");
}

function availableButton(page: Page, category: string) {
  return page
    .getByText(category, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]")
    .getByTitle("Move money");
}

async function availableCents(page: Page, category: string): Promise<number> {
  return cents((await availableButton(page, category).textContent()) ?? "");
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("Next-Month Warning", () => {
  test("a past month shows no dot", async ({ page }) => {
    await page.goto(`/budget?month=${utcMonthKey(-1)}`);
    await expect(page.getByLabel("Next month will start negative")).toHaveCount(0);
  });

  test("the dot and the callout warn, assigning from Ready to Assign leaves it, and moving money in clears it", async ({
    page,
  }) => {
    await page.goto(`/budget?month=${utcMonthKey(0)}`);
    const ready = await pillCents(page);
    const groceries = await availableCents(page, "Groceries");
    const rent = await availableCents(page, "Rent/Mortgage");
    const utilities = await availableCents(page, "Utilities");
    // The example needs Groceries to be the only cash overspend.
    expect(Math.max(0, -rent) + Math.max(0, -utilities)).toBe(0);

    const budget = await prisma.budget.findFirstOrThrow({
      where: { name: "My Budget", ownerId: E2E_TEST_USER_ID, deleted: false },
      orderBy: { createdAt: "asc" },
    });
    const month = currentBudgetMonth();
    const [checking, readyCategory, groceriesCategory, rentCategory] = await Promise.all([
      prisma.account.findFirstOrThrow({ where: { budgetId: budget.id, name: "Checking" } }),
      prisma.category.findFirstOrThrow({
        where: { systemKind: "READY_TO_ASSIGN", categoryGroup: { budgetId: budget.id } },
      }),
      prisma.category.findFirstOrThrow({ where: { name: "Groceries", categoryGroup: { budgetId: budget.id } } }),
      prisma.category.findFirstOrThrow({ where: { name: "Rent/Mortgage", categoryGroup: { budgetId: budget.id } } }),
    ]);
    const assignedBefore = async (categoryId: string) =>
      (await prisma.categoryMonth.findUnique({ where: { categoryId_month: { categoryId, month } } }))?.budgeted ?? 0;
    const [groceriesAssigned, rentAssigned] = await Promise.all([
      assignedBefore(groceriesCategory.id),
      assignedBefore(rentCategory.id),
    ]);

    // Bring Ready to Assign to $50, then take Groceries $200 below zero.
    // Cents × 10 is milliunits.
    const income = await prisma.transaction.create({
      data: {
        accountId: checking.id,
        categoryId: readyCategory.id,
        date: new Date(),
        amount: (5_000 - ready) * 10,
        memo: "E2E next-month warning income",
      },
    });
    const spend = await prisma.transaction.create({
      data: {
        accountId: checking.id,
        categoryId: groceriesCategory.id,
        date: new Date(),
        amount: -(groceries + 20_000) * 10,
        memo: "E2E next-month warning spend",
      },
    });

    try {
      await page.goto(`/budget?month=${utcMonthKey(0)}`);
      await expect(pill(page).getByLabel("Next month will start negative")).toBeVisible();
      expect(await pillCents(page)).toBe(5_000);

      await pill(page).click();
      const drawer = page.getByRole("dialog", { name: monthName(0) });
      const callout = drawer.locator('[aria-label="Next month warning"]');
      await expect(callout).toContainText(`${monthName(1)} will start at \u2212${dollars(15_000)}`);
      await expect(callout).toContainText(
        "Move money from other categories to cover it.",
      );
      await expect(callout).toContainText(`${dollars(20_000)} of cash overspending`);

      await callout.getByRole("button", { name: "Groceries" }).click();
      const popover = page.getByRole("dialog", { name: "Move money for Groceries" });
      await expect(popover).toBeVisible();
      await popover.getByRole("button", { name: "Cancel" }).click();

      // Covering $50 of the overspend from Ready to Assign leaves next month at −$150.
      const form = drawer.getByRole("form", { name: "Assign money" });
      await expect(form.getByLabel("Amount")).toHaveValue("50");
      const to = form.getByLabel("To");
      await to.selectOption((await to.locator("option", { hasText: "Groceries" }).getAttribute("value"))!);
      await form.getByRole("button", { name: "Assign" }).click();

      await expect.poll(() => pillCents(page)).toBe(0);
      await expect(pill(page).getByLabel("Next month will start negative")).toBeVisible();
      await pill(page).click();
      await expect(drawer.locator('[aria-label="Next month warning"]')).toContainText(
        `${monthName(1)} will start at \u2212${dollars(15_000)}`,
      );

      await drawer.getByRole("button", { name: "Groceries" }).click();
      const move = page.getByRole("dialog", { name: "Move money for Groceries" });
      await move.getByRole("radio", { name: /^Into/ }).click();
      await move.getByLabel("Amount").fill("150");
      const from = move.getByLabel("From");
      await from.selectOption((await from.locator("option", { hasText: "Rent/Mortgage" }).getAttribute("value"))!);
      await move.getByRole("button", { name: "Move" }).click();

      await expect(pill(page).getByLabel("Next month will start negative")).toHaveCount(0);
    } finally {
      await prisma.transaction.deleteMany({ where: { id: { in: [income.id, spend.id] } } });
      await prisma.categoryMonth.update({
        where: { categoryId_month: { categoryId: groceriesCategory.id, month } },
        data: { budgeted: groceriesAssigned },
      });
      await prisma.categoryMonth.update({
        where: { categoryId_month: { categoryId: rentCategory.id, month } },
        data: { budgeted: rentAssigned },
      });
    }
  });
});

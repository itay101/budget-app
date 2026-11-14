import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

/**
 * Auto-Assign Underfunded (#219, #147): preview → Confirm → Undo.
 *
 * The seed has no Targets and its Ready to Assign is negative, so this spec
 * adds a $200 monthly Target to Utilities ($150 assigned, so $50 needed)
 * and $300 of Inflow: Ready to Assign income, then removes both and resets
 * Utilities afterwards so later specs see the seed unchanged.
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

function currentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

let incomeId: string;
let utilitiesId: string;
let utilitiesAssignedBefore: number;

async function available(page: Page, category: string) {
  const text = await page
    .getByText(category, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]")
    .getByTitle("Move money")
    .textContent();
  const value = Math.round(Number((text ?? "").replace(/[^0-9.]/g, "")) * 100);
  return /^[-−]/.test((text ?? "").trim()) ? -value : value;
}

test.describe("Auto-Assign", () => {
  test.beforeAll(async () => {
    const budget = await prisma.budget.findFirstOrThrow({
      where: { name: "My Budget", ownerId: E2E_TEST_USER_ID, deleted: false },
      orderBy: { createdAt: "asc" },
    });
    const utilities = await prisma.category.findFirstOrThrow({
      where: { name: "Utilities", categoryGroup: { budgetId: budget.id } },
    });
    utilitiesId = utilities.id;
    const month = currentMonth();
    utilitiesAssignedBefore =
      (await prisma.categoryMonth.findUnique({ where: { categoryId_month: { categoryId: utilitiesId, month } } }))
        ?.budgeted ?? 0;
    await prisma.categoryTarget.upsert({
      where: { categoryId_startMonth: { categoryId: utilitiesId, startMonth: month } },
      create: { categoryId: utilitiesId, startMonth: month, kind: "SET_ASIDE", cadence: "MONTHLY", amount: utilitiesAssignedBefore + 50_000 },
      update: { kind: "SET_ASIDE", cadence: "MONTHLY", amount: utilitiesAssignedBefore + 50_000 },
    });
    const checking = await prisma.account.findFirstOrThrow({ where: { budgetId: budget.id, name: "Checking" } });
    const readyToAssign = await prisma.category.findFirstOrThrow({
      where: { systemKind: "READY_TO_ASSIGN", categoryGroup: { budgetId: budget.id } },
    });
    // Enough income to cover the seed's over-assignment plus the $50 needed.
    const income = await prisma.transaction.create({
      data: { accountId: checking.id, categoryId: readyToAssign.id, date: new Date(), amount: 1_000_000, memo: "E2E auto-assign income" },
    });
    incomeId = income.id;
  });

  test.afterAll(async () => {
    const month = currentMonth();
    await prisma.transaction.delete({ where: { id: incomeId } });
    await prisma.categoryTarget.deleteMany({ where: { categoryId: utilitiesId, startMonth: month } });
    await prisma.categoryMonth.update({
      where: { categoryId_month: { categoryId: utilitiesId, month } },
      data: { budgeted: utilitiesAssignedBefore },
    });
    await prisma.$disconnect();
  });

  test("Underfunded previews the Target's shortfall, assigns it on Confirm, and Undo puts it back", async ({ page }) => {
    await page.goto("/budget");
    const before = await available(page, "Utilities");

    await page.getByRole("button", { name: /Ready to Assign|All Money Assigned|You assigned more than you have/ }).click();
    const menu = page.getByRole("region", { name: "Auto-Assign" });
    await menu.getByRole("button", { name: /^Underfunded/ }).click();

    const preview = page.getByRole("region", { name: "Auto-Assign Underfunded preview" });
    await expect(preview.getByRole("listitem").filter({ hasText: "Utilities" })).toContainText("→");
    await preview.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByRole("status").filter({ hasText: /^Assigned \$50\.00 to 1 category/ })).toBeVisible();
    await expect.poll(() => available(page, "Utilities")).toBe(before + 5_000);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => available(page, "Utilities")).toBe(before);
  });
});

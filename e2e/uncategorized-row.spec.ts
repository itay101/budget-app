import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";
import { addMonths, currentBudgetMonth, formatBudgetMonth, monthDateRange } from "../src/lib/budgetMonth";
import { balanceFor } from "../src/lib/budget";
import { formatMilliunits } from "../src/lib/money";
import { UNCATEGORIZED, transactionFiltersWhere } from "../src/lib/transactionFilters";
import { allAccountsTransactionWhere } from "../src/lib/transactionsView";

/**
 * The pinned Uncategorized row (#225, #182). Specs share one database, and
 * earlier ones can leave uncategorized transactions behind, so the amounts
 * and the count are read back from the database rather than hardcoded.
 * The count uses the all-accounts list's where. Activity and Available use
 * the on-budget sums, folded with balanceFor.
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

function utcMonthKey(offset: number) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The spec's line under the name. One transaction takes "needs". */
function nudge(count: number) {
  return count === 1 ? "1 needs a category" : `${count} need a category`;
}

let budgetId: string;
let checkingId: string;
let payeeId: string;
const createdIds: string[] = [];

test.beforeAll(async () => {
  const budget = await prisma.budget.findFirstOrThrow({
    where: { name: "My Budget", ownerId: E2E_TEST_USER_ID, deleted: false },
    orderBy: { createdAt: "asc" },
  });
  budgetId = budget.id;
  const checking = await prisma.account.findFirstOrThrow({
    where: { budgetId, name: "Checking", onBudget: true },
  });
  checkingId = checking.id;
  const payee = await prisma.payee.create({
    data: { budgetId, name: "E2E Uncategorized Cafe" },
  });
  payeeId = payee.id;
});

test.afterEach(async () => {
  if (createdIds.length === 0) return;
  await prisma.transaction.deleteMany({ where: { id: { in: createdIds.splice(0) } } });
});

test.afterAll(async () => {
  await prisma.payee.delete({ where: { id: payeeId } }).catch(() => {});
  await prisma.$disconnect();
});

function region(page: Page) {
  return page.getByRole("region", { name: "Uncategorized" });
}

/** On-budget uncategorized activity by Budget Month, the row's source. */
async function activityByMonth() {
  const rows = await prisma.$queryRaw<{ month: string; amount: bigint }[]>`
    SELECT to_char(date_trunc('month', t."date"), 'YYYY-MM') AS "month",
           SUM(t."amount")::bigint AS "amount"
    FROM "Transaction" t
    JOIN "Account" a ON a.id = t."accountId"
    WHERE a."budgetId" = ${budgetId}
      AND a."onBudget" = true
      AND t."categoryId" IS NULL
    GROUP BY 1
  `;
  return new Map(rows.map((row) => [row.month, Number(row.amount)]));
}

function rowFigures(activity: Map<string, number>, month: Date) {
  const available = balanceFor("uncategorized", new Map(), new Map([["uncategorized", activity]]), month).available;
  return { activity: activity.get(formatBudgetMonth(month)) ?? 0, available };
}

/** How many rows the uncategorized transactions list shows for the month. */
async function listCount(month: Date) {
  const { from, to } = monthDateRange(month);
  return prisma.transaction.count({
    where: {
      ...allAccountsTransactionWhere(budgetId),
      ...transactionFiltersWhere({
        dateFrom: from,
        dateTo: to,
        preset: null,
        category: UNCATEGORIZED,
        direction: "all",
        q: "",
      }),
    },
  });
}

test.describe("Uncategorized row", () => {
  test("pins the row, links its name and activity, and the count matches the list", async ({ page }) => {
    const month = currentBudgetMonth();
    const coffee = await prisma.transaction.create({
      data: { accountId: checkingId, payeeId, date: new Date(), amount: -12_500, memo: "E2E uncategorized coffee" },
    });
    const bus = await prisma.transaction.create({
      data: { accountId: checkingId, payeeId, date: new Date(), amount: -7_250, memo: "E2E uncategorized bus" },
    });
    createdIds.push(coffee.id, bus.id);

    const count = await listCount(month);
    const figures = rowFigures(await activityByMonth(), month);
    expect(count).toBeGreaterThanOrEqual(2);

    await page.goto(`/budget?month=${utcMonthKey(0)}`);
    const row = region(page);
    await expect(row).toBeVisible();
    await expect(row.getByText(nudge(count))).toBeVisible();
    await expect(row.getByTitle("Categorize these transactions instead of budgeting here")).toHaveText("—");
    await expect(row.locator("input, button")).toHaveCount(0);
    await expect(row.getByText("Add target")).toHaveCount(0);

    const activity = row.getByRole("link", { name: formatMilliunits(figures.activity, "USD") });
    await expect(activity).toBeVisible();
    const availableClass = figures.available < 0 ? ".text-danger" : figures.available > 0 ? ".font-medium.text-neutral-600" : ".text-success";
    await expect(row.locator(availableClass).last()).toHaveText(formatMilliunits(figures.available, "USD"));

    const { from, to } = monthDateRange(month);
    const href = `/accounts/all?category=__uncategorized__&from=${from}&to=${to}`;
    await expect(row.getByRole("link", { name: "Uncategorized" })).toHaveAttribute("href", href);
    await expect(activity).toHaveAttribute("href", href);

    const rowBox = await row.boundingBox();
    const groupBox = await page.getByText("Immediate Obligations", { exact: true }).boundingBox();
    expect(rowBox!.y).toBeLessThan(groupBox!.y);

    const groceries = page
      .getByText("Groceries", { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'grid-cols-2')][1]");
    await groceries.getByTitle("Move money").click();
    const dialog = page.getByRole("dialog", { name: "Move money for Groceries" });
    await expect(dialog.getByRole("option", { name: /Uncategorized/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByRole("link", { name: /^Snoozed/ }).click();
    await expect(region(page)).toBeVisible();

    await row.getByRole("link", { name: "Uncategorized" }).click();
    await expect(page).toHaveURL(new RegExp(`category=__uncategorized__.*from=${from}`));
    await expect(page.locator("input[value='E2E Uncategorized Cafe']")).toHaveCount(2);
    await expect(page.getByText(`Showing ${count} of`)).toBeVisible();

    const next = addMonths(month, 1);
    const nextCount = await listCount(next);
    const nextFigures = rowFigures(await activityByMonth(), next);
    await page.goto(`/budget?month=${utcMonthKey(1)}`);
    if (nextCount > 0 || nextFigures.available !== 0) {
      await expect(region(page)).toBeVisible();
    } else {
      await expect(region(page)).toHaveCount(0);
    }
  });

  test("keeps a carried positive Available on screen in grey", async ({ page }) => {
    const month = currentBudgetMonth();
    const lastMonth = addMonths(month, -1);
    // Large enough that this month's Available stays positive even when
    // earlier specs left uncategorized spending behind.
    const inflow = await prisma.transaction.create({
      data: { accountId: checkingId, payeeId, date: lastMonth, amount: 100_000_000, memo: "E2E uncategorized refund" },
    });
    createdIds.push(inflow.id);

    const count = await listCount(month);
    const figures = rowFigures(await activityByMonth(), month);
    expect(figures.available).toBeGreaterThan(0);
    // The refund is last month's activity, so it isn't this month's link.
    expect(figures.activity).toBeLessThan(figures.available);

    await page.goto(`/budget?month=${utcMonthKey(0)}`);
    const row = region(page);
    await expect(row).toBeVisible();
    await expect(row.getByText(nudge(count))).toBeVisible();
    await expect(row.getByRole("link", { name: formatMilliunits(figures.activity, "USD") })).toBeVisible();
    const available = row.locator(".font-medium.text-neutral-600");
    await expect(available).toHaveText(formatMilliunits(figures.available, "USD"));
    await expect(row.locator(".text-success")).toHaveCount(0);
    await expect(row.locator(".text-danger")).toHaveCount(0);
  });
});

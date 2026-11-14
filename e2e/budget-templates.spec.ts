import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

/**
 * #212: a new budget starts from a template (seeded with its groups and
 * categories, in order) or blank (nothing seeded), picked in the sidebar's
 * new-budget form, which previews the template before committing.
 *
 * Uses its own NZD/SEK budgets so other specs' currencies stay free, and
 * deletes them afterwards (groups/categories cascade).
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const TEMPLATE_BUDGET = "E2E Minimalist Budget";
const BLANK_BUDGET = "E2E Blank Budget";

const SIMPLE_LIFE = [
  "🍔 Food",
  "🏠 Needs",
  "💸 Wants",
  "✈️ Travel",
  "🚨 Emergency",
  "💰 Savings",
];

/** Opens the switcher (whatever budget is current) and its new-budget form. */
async function openNewBudgetForm(page: Page) {
  await page.goto("/budget");
  await page.getByRole("button", { name: / \(.+\)$/ }).first().click();
  await page.getByRole("button", { name: "New budget" }).click();
}

async function seededGroups(budgetName: string) {
  const budget = await prisma.budget.findFirstOrThrow({
    where: { name: budgetName, ownerId: E2E_TEST_USER_ID, deleted: false },
  });
  return prisma.categoryGroup.findMany({
    where: { budgetId: budget.id },
    orderBy: { sortOrder: "asc" },
    include: { categories: { orderBy: { sortOrder: "asc" } } },
  });
}

test.describe("new budget templates", () => {
  test.afterAll(async () => {
    await prisma.budget.deleteMany({ where: { name: { in: [TEMPLATE_BUDGET, BLANK_BUDGET] } } });
    await prisma.$disconnect();
  });

  test("creating a budget from a template seeds its groups and categories in order", async ({
    page,
  }) => {
    await openNewBudgetForm(page);
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(TEMPLATE_BUDGET);
    await page.getByRole("combobox", { name: "Currency" }).selectOption("NZD");

    const startWith = page.getByRole("combobox", { name: "Start with" });
    await expect(startWith).toHaveValue("beginner");
    await startWith.selectOption({ label: "Minimalist" });

    const preview = page.getByRole("region", { name: "Minimalist categories" });
    await expect(preview.getByText("The Simple Life")).toBeVisible();
    await expect(preview.getByRole("listitem")).toHaveText(SIMPLE_LIFE);

    await page.getByRole("button", { name: "Create" }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(`^${TEMPLATE_BUDGET} \\(`) }),
    ).toBeVisible();
    await expect(page.getByText("The Simple Life")).toBeVisible();

    const groups = await seededGroups(TEMPLATE_BUDGET);
    expect(groups.map((g) => g.name)).toEqual(["The Simple Life"]);
    expect(groups[0].categories.map((c) => c.name)).toEqual(SIMPLE_LIFE);
  });

  test("creating a blank budget seeds no categories", async ({ page }) => {
    await openNewBudgetForm(page);
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(BLANK_BUDGET);
    await page.getByRole("combobox", { name: "Currency" }).selectOption("SEK");
    await page.getByRole("combobox", { name: "Start with" }).selectOption({ label: "Blank" });
    await expect(page.getByRole("region", { name: "Blank categories" })).toHaveText(
      "No categories — start from scratch.",
    );

    await page.getByRole("button", { name: "Create" }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(`^${BLANK_BUDGET} \\(`) }),
    ).toBeVisible();

    expect(await seededGroups(BLANK_BUDGET)).toEqual([]);
  });
});

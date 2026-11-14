import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

/**
 * #212: a new budget starts from a template (seeded with its groups and
 * categories, in order) or blank (nothing seeded). The sidebar's
 * new-budget form collects the name and currency, then a dialog shows a
 * gallery of template tiles with the selected one's categories previewed,
 * and "Pick <template>" / "Start Blank" create the budget.
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

/** Fills the switcher's new-budget form and opens the template dialog. */
async function openTemplateDialog(page: Page, name: string, currency: string) {
  await page.goto("/budget");
  await page.getByRole("button", { name: / \(.+\)$/ }).first().click();
  await page.getByRole("button", { name: "New budget" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("combobox", { name: "Currency" }).selectOption(currency);
  await page.getByRole("button", { name: "Choose template" }).click();
  return page.getByRole("dialog", { name: `How should “${name}” start?` });
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
    const dialog = await openTemplateDialog(page, TEMPLATE_BUDGET, "NZD");
    await expect(dialog.getByRole("radio", { name: /^Beginner/ })).toBeChecked();
    await expect(dialog.getByRole("button", { name: "Pick Beginner" })).toBeVisible();

    await dialog.getByRole("radio", { name: /^Minimalist/ }).click();
    const preview = dialog.getByRole("region", { name: "Minimalist categories" });
    await expect(preview.getByText("The Simple Life")).toBeVisible();
    await expect(preview.getByRole("listitem")).toHaveText(SIMPLE_LIFE);

    await dialog.getByRole("button", { name: "Pick Minimalist" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: new RegExp(`^${TEMPLATE_BUDGET} \\(`) }),
    ).toBeVisible();
    await expect(page.getByText("The Simple Life")).toBeVisible();

    const groups = await seededGroups(TEMPLATE_BUDGET);
    expect(groups.map((g) => g.name)).toEqual(["The Simple Life"]);
    expect(groups[0].categories.map((c) => c.name)).toEqual(SIMPLE_LIFE);
  });

  test("creating a blank budget seeds no categories", async ({ page }) => {
    const dialog = await openTemplateDialog(page, BLANK_BUDGET, "SEK");
    await expect(dialog.getByRole("radio", { name: /^Blank/ })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Start Blank" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: new RegExp(`^${BLANK_BUDGET} \\(`) }),
    ).toBeVisible();

    expect(await seededGroups(BLANK_BUDGET)).toEqual([]);
  });
});

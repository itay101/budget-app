import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { AddCategoryGroupPopover } from "@/components/AddCategoryGroupPopover";
import { CategoryGroupSection } from "@/components/CategoryGroupSection";
import { HiddenCategoriesSection } from "@/components/HiddenCategoriesSection";
import {
  createCategory,
  createCategoryGroup,
  deleteCategoryGroup,
  moveCategory,
  renameCategory,
  renameCategoryGroup,
  setBudgeted,
  setCategoryHidden,
  transferAvailable,
} from "./actions";

export const dynamic = "force-dynamic";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export default async function BudgetPage() {
  const budget = await getCurrentBudget();
  const month = startOfMonth(new Date());
  const nextMonth = startOfNextMonth(month);

  const groups = await prisma.categoryGroup.findMany({
    where: { budgetId: budget.id },
    orderBy: { sortOrder: "asc" },
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          months: { where: { month } },
          transactions: {
            where: { date: { gte: month, lt: nextMonth } },
            select: { amount: true },
          },
        },
      },
    },
  });

  const categoryIds = groups.flatMap((g) => g.categories.map((c) => c.id));

  // Available rolls forward month to month, YNAB-style: this month's
  // available is everything ever budgeted to the category through this
  // month, plus everything ever spent/earned in it through this month.
  // That's equivalent to (last month's available) + (this month's
  // budgeted) + (this month's activity), computed here as a running total
  // rather than recursively.
  const [budgetedTotals, activityTotals] = await Promise.all([
    prisma.categoryMonth.groupBy({
      by: ["categoryId"],
      where: { categoryId: { in: categoryIds }, month: { lt: nextMonth } },
      _sum: { budgeted: true },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { categoryId: { in: categoryIds }, date: { lt: nextMonth } },
      _sum: { amount: true },
    }),
  ]);

  const budgetedThroughMonth = new Map(
    budgetedTotals.map((row) => [row.categoryId, row._sum.budgeted ?? 0]),
  );
  const activityThroughMonth = new Map(
    activityTotals.map((row) => [row.categoryId!, row._sum.amount ?? 0]),
  );

  function availableFor(categoryId: string): number {
    return (
      (budgetedThroughMonth.get(categoryId) ?? 0) +
      (activityThroughMonth.get(categoryId) ?? 0)
    );
  }

  function rowFor(category: (typeof groups)[number]["categories"][number]) {
    return {
      id: category.id,
      name: category.name,
      budgeted: category.months[0]?.budgeted ?? 0,
      activity: category.transactions.reduce((sum, t) => sum + t.amount, 0),
      available: availableFor(category.id),
    };
  }

  // Slimmed-down category list (just id/name/available) for the "move
  // money to…" popover on each Available cell. Includes hidden categories
  // too — they still have money in them, and still need somewhere to move
  // it to/from.
  const categoryOptions = groups.map((group) => ({
    id: group.id,
    name: group.name,
    categories: group.categories.map((c) => ({
      id: c.id,
      name: c.name,
      available: availableFor(c.id),
    })),
  }));

  // Hiding is presentational only — a hidden category keeps its real
  // categoryGroupId/sortOrder (see the `hidden` field's doc comment in
  // schema.prisma) — so it's filtered out of its real group's rendered
  // rows here and collected into one synthetic "Hidden" section instead,
  // appended after every real group. That section only renders at all
  // when it's non-empty.
  const hiddenCategories = groups.flatMap((group) =>
    group.categories
      .filter((c) => c.hidden)
      .map((category) => ({ ...rowFor(category), groupName: group.name })),
  );

  return (
    <div className="space-y-300">
      <div>
        <h1 className="text-h1 text-neutral-800">Budget</h1>
        <p className="text-body text-neutral-600">
          {month.toLocaleString("en-US", { month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
        <div className="grid grid-cols-[1fr_120px_120px_120px] items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600">
          <div className="flex items-center gap-2">
            <span>Category</span>
            <AddCategoryGroupPopover createCategoryGroup={createCategoryGroup} />
          </div>
          <div className="text-right">Budgeted</div>
          <div className="text-right">Activity</div>
          <div className="text-right">Available</div>
        </div>

        {groups.map((group) => (
          <CategoryGroupSection
            key={group.id}
            groupId={group.id}
            groupName={group.name}
            month={month.toISOString()}
            currency={budget.currency}
            isEmpty={group.categories.length === 0}
            createCategory={createCategory}
            renameCategoryGroup={renameCategoryGroup}
            renameCategory={renameCategory}
            deleteCategoryGroup={deleteCategoryGroup}
            moveCategory={moveCategory}
            setBudgeted={setBudgeted}
            setCategoryHidden={setCategoryHidden}
            transferAvailable={transferAvailable}
            categoryOptions={categoryOptions}
            categories={group.categories
              .filter((c) => !c.hidden)
              .map(rowFor)}
          />
        ))}

        {groups.length === 0 && (
          <div className="px-200 py-300 text-body text-neutral-600">
            No category groups yet. Use the &ldquo;Add&rdquo; button above to
            get started.
          </div>
        )}

        {hiddenCategories.length > 0 && (
          <HiddenCategoriesSection
            month={month.toISOString()}
            currency={budget.currency}
            renameCategory={renameCategory}
            setBudgeted={setBudgeted}
            setCategoryHidden={setCategoryHidden}
            transferAvailable={transferAvailable}
            categoryOptions={categoryOptions}
            categories={hiddenCategories}
          />
        )}
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import {
  getBudgetMonthRange,
  getBudgetMonthRows,
  getCurrentBudget,
} from "@/lib/budget";
import {
  currentBudgetMonth,
  formatBudgetMonth,
  monthLabel,
  resolveViewedMonth,
} from "@/lib/budgetMonth";
import {
  budgetTable,
  parseQuickFilter,
  quickFilterCounts,
  underfundedBanner,
} from "@/lib/targetDisplay";
import { MonthHeader } from "@/components/MonthHeader";
import { AddCategoryGroupPopover } from "@/components/AddCategoryGroupPopover";
import { CategoryGroupSection } from "@/components/CategoryGroupSection";
import { HiddenCategoriesSection } from "@/components/HiddenCategoriesSection";
import { QuickFilterBar, UnderfundedBanner } from "@/components/BudgetQuickFilters";
import {
  createCategory,
  createCategoryGroup,
  deleteCategoryGroup,
  moveCategory,
  removeTarget,
  renameCategory,
  renameCategoryGroup,
  setBudgeted,
  setCategoryHidden,
  setTarget,
  snoozeTarget,
  transferAvailable,
  unsnoozeTarget,
} from "./actions";

const targetActions = { setTarget, removeTarget, snoozeTarget, unsnoozeTarget };

export const dynamic = "force-dynamic";

/**
 * `/budget?month=YYYY-MM` (#124). A missing or malformed month shows the
 * current UTC month; one outside the budget's navigable range redirects to
 * the nearest month in range, so the URL always matches what's shown.
 *
 * `&filter=` picks a quick filter (#171). All is the normal budget, with
 * hidden categories collapsed into their own section; every other filter
 * lists the matching categories, hidden ones included, in their real
 * groups.
 */
export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[]; filter?: string | string[] }>;
}) {
  const params = await searchParams;
  const budget = await getCurrentBudget();
  const current = currentBudgetMonth();
  const range = await getBudgetMonthRange(budget.id);

  const viewed = resolveViewedMonth(params.month, range, current);
  if ("redirectTo" in viewed) {
    redirect(`/budget?month=${formatBudgetMonth(viewed.redirectTo)}`);
  }
  const { month } = viewed;
  const monthKey = formatBudgetMonth(month);

  const { groups, categoryOptions, hiddenCategories, totals } = await getBudgetMonthRows(
    budget.id,
    month,
  );

  const filter = parseQuickFilter(params.filter);
  const allRows = [...groups.flatMap((group) => group.categories), ...hiddenCategories];
  const table = budgetTable(filter, groups, hiddenCategories, month);

  return (
    <div className="space-y-300">
      <h1 className="text-h2 text-neutral-800 sm:text-h1">Budget</h1>

      {/* Sticky month toolbar (#136): under the mobile top bar on phones,
          edge to edge there; at the top of the page from md up. */}
      <div className="sticky top-mobile-nav z-10 -mx-200 border-y border-neutral-200 bg-neutral-100/95 px-200 py-1 backdrop-blur md:top-0 md:mx-0 md:rounded-lg md:border md:bg-neutral-0/95 md:px-2">
        <MonthHeader
          month={monthKey}
          current={formatBudgetMonth(current)}
          first={formatBudgetMonth(range.first)}
          last={formatBudgetMonth(range.last)}
        />
      </div>

      <div className="space-y-200">
        <UnderfundedBanner
          totals={totals}
          counts={underfundedBanner(allRows)}
          month={monthKey}
          filter={filter}
          currency={budget.currency}
        />
        <QuickFilterBar counts={quickFilterCounts(allRows)} month={monthKey} filter={filter} />
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600 sm:grid sm:grid-cols-budget lg:grid-cols-budget-targets lg:gap-x-4">
          <div className="flex items-center gap-2">
            <span>Category</span>
            <AddCategoryGroupPopover createCategoryGroup={createCategoryGroup} />
          </div>
          <div className="hidden lg:block">Target · {monthLabel(month, "short")}</div>
          <div className="hidden text-right sm:block">Budgeted</div>
          <div className="hidden text-right sm:block">Activity</div>
          <div className="hidden text-right sm:block">Available</div>
        </div>

        {table.groups.map((group) => (
          <CategoryGroupSection
            key={group.id}
            groupId={group.id}
            groupName={group.name}
            month={monthKey}
            currency={budget.currency}
            isEmpty={group.isEmpty}
            createCategory={createCategory}
            renameCategoryGroup={renameCategoryGroup}
            renameCategory={renameCategory}
            deleteCategoryGroup={deleteCategoryGroup}
            moveCategory={moveCategory}
            setBudgeted={setBudgeted}
            setCategoryHidden={setCategoryHidden}
            transferAvailable={transferAvailable}
            targetActions={targetActions}
            categoryOptions={categoryOptions}
            categories={group.categories}
          />
        ))}

        {table.emptyMessage && (
          <div className="px-200 py-300 text-body text-neutral-600">{table.emptyMessage}</div>
        )}

        {table.hiddenSection.length > 0 && (
          <HiddenCategoriesSection
            month={monthKey}
            currency={budget.currency}
            renameCategory={renameCategory}
            setBudgeted={setBudgeted}
            setCategoryHidden={setCategoryHidden}
            transferAvailable={transferAvailable}
            targetActions={targetActions}
            categoryOptions={categoryOptions}
            categories={table.hiddenSection}
          />
        )}
      </div>
    </div>
  );
}

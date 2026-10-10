import { redirect } from "next/navigation";
import {
  getBudgetMonthRange,
  getBudgetMonthRows,
  getCurrentBudget,
} from "@/lib/budget";
import {
  currentBudgetMonth,
  formatBudgetMonth,
  resolveViewedMonth,
} from "@/lib/budgetMonth";
import { MonthHeader } from "@/components/MonthHeader";
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

/**
 * `/budget?month=YYYY-MM` (#124). A missing or malformed month shows the
 * current UTC month; one outside the budget's navigable range redirects to
 * the nearest month in range, so the URL always matches what's shown.
 */
export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const budget = await getCurrentBudget();
  const current = currentBudgetMonth();
  const range = await getBudgetMonthRange(budget.id);

  const viewed = resolveViewedMonth((await searchParams).month, range, current);
  if ("redirectTo" in viewed) {
    redirect(`/budget?month=${formatBudgetMonth(viewed.redirectTo)}`);
  }
  const { month } = viewed;
  const monthKey = formatBudgetMonth(month);

  const { groups, categoryOptions, hiddenCategories } = await getBudgetMonthRows(
    budget.id,
    month,
  );

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

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600 sm:grid sm:grid-cols-[1fr_120px_120px_120px]">
          <div className="flex items-center gap-2">
            <span>Category</span>
            <AddCategoryGroupPopover createCategoryGroup={createCategoryGroup} />
          </div>
          <div className="hidden text-right sm:block">Budgeted</div>
          <div className="hidden text-right sm:block">Activity</div>
          <div className="hidden text-right sm:block">Available</div>
        </div>

        {groups.map((group) => (
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
            categoryOptions={categoryOptions}
            categories={group.categories}
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
            month={monthKey}
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

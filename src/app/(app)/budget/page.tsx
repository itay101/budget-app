import { getBudgetMonthRows, getCurrentBudget } from "@/lib/budget";
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

export default async function BudgetPage() {
  const budget = await getCurrentBudget();
  const month = startOfMonth(new Date());

  const { groups, categoryOptions, hiddenCategories } = await getBudgetMonthRows(
    budget.id,
    month,
  );

  return (
    <div className="space-y-300">
      <div>
        <h1 className="text-h2 text-neutral-800 sm:text-h1">Budget</h1>
        <p className="text-body text-neutral-600">
          {month.toLocaleString("en-US", { month: "long", year: "numeric" })}
        </p>
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
            month={month.toISOString()}
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

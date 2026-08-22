import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBudget } from "@/lib/budget";
import { formatMilliunits, milliunitsToNumber } from "@/lib/money";
import { MoveMoneyPopover } from "@/components/MoveMoneyPopover";
import {
  createCategory,
  createCategoryGroup,
  setBudgeted,
  transferAvailable,
} from "./actions";

export const dynamic = "force-dynamic";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

// NOTE: no rollover from prior months yet — available is just this month's
// budgeted + activity. A future feature.
function availableFor(category: {
  months: { budgeted: number }[];
  transactions: { amount: number }[];
}): number {
  const budgeted = category.months[0]?.budgeted ?? 0;
  const activity = category.transactions.reduce((sum, t) => sum + t.amount, 0);
  return budgeted + activity;
}

export default async function BudgetPage() {
  const budget = await getOrCreateDefaultBudget();
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

  // Slimmed-down category list (no months/transactions) for the "move
  // money to…" popover on each Available cell.
  const categoryOptions = groups.map((group) => ({
    id: group.id,
    name: group.name,
    categories: group.categories.map((c) => ({ id: c.id, name: c.name })),
  }));

  return (
    <div className="space-y-300">
      <div>
        <h1 className="text-h1 text-neutral-800">Budget</h1>
        <p className="text-body text-neutral-600">
          {month.toLocaleString("en-US", { month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
        <div className="grid grid-cols-[1fr_120px_120px_120px] gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600">
          <div>Category</div>
          <div className="text-right">Budgeted</div>
          <div className="text-right">Activity</div>
          <div className="text-right">Available</div>
        </div>

        {groups.map((group) => (
          <div key={group.id}>
            <div className="flex items-center justify-between gap-2 bg-neutral-100 px-200 py-1.5 text-small font-semibold uppercase tracking-wide text-neutral-600">
              <span>{group.name}</span>
              <form
                action={createCategory}
                className="flex items-center gap-1 normal-case tracking-normal"
              >
                <input
                  type="hidden"
                  name="categoryGroupId"
                  value={group.id}
                />
                <input
                  name="name"
                  placeholder="Add category"
                  required
                  className="w-36 rounded border border-neutral-200 bg-neutral-0 px-2 py-1 text-small font-normal text-neutral-800 focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                />
                <button
                  type="submit"
                  className="rounded px-1.5 py-1 text-small font-medium text-brand-700 hover:bg-brand-700/10"
                >
                  + Add
                </button>
              </form>
            </div>
            {group.categories.map((category) => {
              const budgeted = category.months[0]?.budgeted ?? 0;
              const activity = category.transactions.reduce(
                (sum, t) => sum + t.amount,
                0,
              );
              const available = availableFor(category);

              return (
                <div
                  key={category.id}
                  className="grid grid-cols-[1fr_120px_120px_120px] items-center gap-2 border-b border-neutral-100 px-200 py-2 text-body last:border-b-0"
                >
                  <div className="text-neutral-800">{category.name}</div>
                  <form
                    action={setBudgeted}
                    className="flex items-center justify-end gap-1"
                  >
                    <input type="hidden" name="categoryId" value={category.id} />
                    <input
                      type="hidden"
                      name="month"
                      value={month.toISOString()}
                    />
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      defaultValue={milliunitsToNumber(budgeted)}
                      className="w-20 rounded border border-neutral-200 px-2 py-1 text-right text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                    />
                    <button
                      type="submit"
                      className="rounded px-1.5 py-1 text-small text-brand-700 hover:bg-brand-700/10"
                      title="Save"
                    >
                      ✓
                    </button>
                  </form>
                  <div className="text-right text-neutral-800">
                    {formatMilliunits(activity, budget.currency)}
                  </div>
                  <div className="text-right">
                    <MoveMoneyPopover
                      categoryId={category.id}
                      categoryName={category.name}
                      month={month.toISOString()}
                      currency={budget.currency}
                      available={available}
                      groups={categoryOptions}
                      transferAvailable={transferAvailable}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {groups.length === 0 && (
          <div className="px-200 py-300 text-body text-neutral-600">
            No category groups yet. Add one below to get started.
          </div>
        )}
      </div>

      <form
        action={createCategoryGroup}
        className="max-w-sm space-y-3 rounded-lg border border-neutral-200 bg-neutral-0 p-200"
      >
        <h2 className="text-h3 text-neutral-800">Add category group</h2>
        <div>
          <label
            className="block text-small text-neutral-600"
            htmlFor="group-name"
          >
            Name
          </label>
          <input
            id="group-name"
            name="name"
            required
            className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-brand-700 px-4 py-2 text-body font-medium text-white hover:bg-brand-800 active:bg-brand-900"
        >
          Add category group
        </button>
      </form>
    </div>
  );
}

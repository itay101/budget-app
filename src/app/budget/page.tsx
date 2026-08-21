import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBudget } from "@/lib/budget";
import { formatMilliunits, milliunitsToNumber } from "@/lib/money";
import { setBudgeted } from "./actions";

export const dynamic = "force-dynamic";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Budget</h1>
        <p className="text-sm text-slate-500">
          {month.toLocaleString("en-US", { month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_120px_120px_120px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>Category</div>
          <div className="text-right">Budgeted</div>
          <div className="text-right">Activity</div>
          <div className="text-right">Available</div>
        </div>

        {groups.map((group) => (
          <div key={group.id}>
            <div className="bg-slate-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {group.name}
            </div>
            {group.categories.map((category) => {
              const budgeted = category.months[0]?.budgeted ?? 0;
              const activity = category.transactions.reduce(
                (sum, t) => sum + t.amount,
                0,
              );
              // NOTE: no rollover from prior months yet — available is just
              // this month's budgeted + activity. A future feature.
              const available = budgeted + activity;

              return (
                <div
                  key={category.id}
                  className="grid grid-cols-[1fr_120px_120px_120px] items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm last:border-b-0"
                >
                  <div>{category.name}</div>
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
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                      title="Save"
                    >
                      ✓
                    </button>
                  </form>
                  <div className="text-right">
                    {formatMilliunits(activity, budget.currency)}
                  </div>
                  <div
                    className={
                      "text-right font-medium " +
                      (available < 0 ? "text-red-600" : "text-emerald-600")
                    }
                  >
                    {formatMilliunits(available, budget.currency)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {groups.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500">
            No category groups yet. Run{" "}
            <code className="rounded bg-slate-100 px-1">npm run db:seed</code>{" "}
            to add starter categories, or add them directly in Prisma Studio.
          </div>
        )}
      </div>
    </div>
  );
}

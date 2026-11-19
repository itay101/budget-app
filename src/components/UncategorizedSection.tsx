import Link from "next/link";
import { ActivityLink, activityTransactionsHref } from "@/components/ActivityLink";
import { formatMilliunits } from "@/lib/money";
import type { UncategorizedRow } from "@/lib/budget";
import { UNCATEGORIZED } from "@/lib/transactionFilters";
import { uncategorizedAvailableClass, uncategorizedNudge } from "@/lib/uncategorizedRow";

/** Same grid as BudgetCategoryRow, including `grid-cols-2`, which the e2e
 * specs find a row by. Duplicated so this server component doesn't import
 * that client module. */
const ROW_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-2 border-b border-neutral-100 px-200 py-3 text-body sm:grid-cols-budget sm:items-center sm:gap-2 sm:py-2 lg:grid-cols-budget-targets lg:gap-x-4";

/** Tooltip on the non-interactive Budgeted dash (#182). */
const BUDGETED_TOOLTIP = "Categorize these transactions instead of budgeting here";

/**
 * The locked Uncategorized group pinned at the top of the budget table
 * (#182, #225). One row: the name and Activity link to this month's
 * uncategorized transactions, Budgeted is a dash, and there is no Target
 * menu, Move Money button, or Auto-Assign control. The page renders this
 * whenever the row is visible, under every quick filter.
 */
export function UncategorizedSection({
  row,
  month,
  currency,
}: {
  /** Null when the month has nothing to show (#182). */
  row: UncategorizedRow | null;
  /** The viewed Budget Month, `YYYY-MM`. */
  month: string;
  currency: string;
}) {
  if (!row) return null;
  const href = activityTransactionsHref(UNCATEGORIZED, month);

  return (
    <section aria-label="Uncategorized">
      <div className="flex items-center gap-2 bg-neutral-100 px-200 py-1.5 text-small font-semibold uppercase tracking-wide text-neutral-600">
        <span>Uncategorized</span>
      </div>
      <div className={ROW_GRID}>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <Link href={href} className="font-medium text-neutral-800 hover:underline">
            <bdi>Uncategorized</bdi>
          </Link>
          <p className="text-small text-neutral-600">{uncategorizedNudge(row.count)}</p>
        </div>
        {/* No target cell below `lg`: an empty one would open a blank row.
            From `lg` the column has to be present so Budgeted stays put. */}
        <div className="hidden lg:block" />
        <div className="col-span-2 text-neutral-600 sm:col-span-1 sm:text-right">
          <div className="mb-1 text-small text-neutral-600 sm:hidden">Budgeted</div>
          <span title={BUDGETED_TOOLTIP}>—</span>
        </div>
        <div className="text-neutral-800 sm:col-span-1 sm:text-right">
          <div className="text-small text-neutral-600 sm:hidden">Activity</div>
          <ActivityLink categoryId={UNCATEGORIZED} month={month} amount={row.activity} currency={currency} />
        </div>
        <div className="sm:col-span-1 sm:text-right">
          <div className="text-small text-neutral-600 sm:hidden">Available</div>
          <span className={`font-medium ${uncategorizedAvailableClass(row.available)}`}>
            {formatMilliunits(row.available, currency)}
          </span>
        </div>
      </div>
    </section>
  );
}

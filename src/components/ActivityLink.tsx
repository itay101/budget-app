import Link from "next/link";
import { formatMilliunits } from "@/lib/money";
import { monthDateRange, parseBudgetMonth } from "@/lib/budgetMonth";
import { FILTER_PARAMS } from "@/lib/transactionFilters";

/**
 * The all-accounts list filtered to one category and one Budget Month
 * (#124). `categoryId` may be the `__uncategorized__` sentinel (#225).
 */
export function activityTransactionsHref(categoryId: string, month: string): string {
  const { from, to } = monthDateRange(parseBudgetMonth(month)!);
  const params = new URLSearchParams({
    [FILTER_PARAMS.category]: categoryId,
    [FILTER_PARAMS.dateFrom]: from,
    [FILTER_PARAMS.dateTo]: to,
  });
  return `/accounts/all?${params.toString()}`;
}

/**
 * A category's Activity amount on the budget page, linking to the
 * all-accounts transactions list filtered to that category and the viewed
 * Budget Month (#124) via the list's existing filter params.
 */
export function ActivityLink({
  categoryId,
  month,
  amount,
  currency,
}: {
  categoryId: string;
  /** The viewed Budget Month, `YYYY-MM`. */
  month: string;
  amount: number;
  currency: string;
}) {
  return (
    <Link
      href={activityTransactionsHref(categoryId, month)}
      title="Show this month's transactions"
      className="rounded-sm px-1 py-0.5 hover:bg-neutral-100 hover:underline"
    >
      {formatMilliunits(amount, currency)}
    </Link>
  );
}

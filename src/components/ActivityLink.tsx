import Link from "next/link";
import { formatMilliunits } from "@/lib/money";
import { monthDateRange, parseBudgetMonth } from "@/lib/budgetMonth";
import { FILTER_PARAMS } from "@/lib/transactionFilters";

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
  const { from, to } = monthDateRange(parseBudgetMonth(month)!);
  const params = new URLSearchParams({
    [FILTER_PARAMS.category]: categoryId,
    [FILTER_PARAMS.dateFrom]: from,
    [FILTER_PARAMS.dateTo]: to,
  });
  return (
    <Link
      href={`/accounts/all?${params.toString()}`}
      title="Show this month's transactions"
      className="rounded px-1 py-0.5 hover:bg-neutral-100 hover:underline"
    >
      {formatMilliunits(amount, currency)}
    </Link>
  );
}

import Link from "next/link";
import { formatMilliunitsLtr } from "@/lib/money";
import { QUICK_FILTERS, type UnderfundedBanner as BannerCounts } from "@/lib/targetDisplay";
import type { PlanTotals, QuickFilter } from "@/lib/targets";
import { Icon } from "@/components/Icon";

/** `/budget` for a month and quick filter; All leaves `filter` out. */
function budgetHref(month: string, filter: QuickFilter): string {
  return `/budget?month=${month}${filter === "all" ? "" : `&filter=${filter}`}`;
}

/**
 * The Underfunded banner above the budget table (#171): what targets still
 * need this month (hidden categories included, snoozed ones skipped) plus
 * overspending to cover. "Show only these" selects the Underfunded quick
 * filter.
 */
export function UnderfundedBanner({
  totals,
  counts,
  month,
  filter,
  currency,
}: {
  totals: PlanTotals;
  counts: BannerCounts;
  month: string;
  filter: QuickFilter;
  currency: string;
}) {
  const fmt = (milliunits: number) => formatMilliunitsLtr(milliunits, currency);
  const short = counts.count > 0 || totals.overspending > 0;

  if (!short) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-target-funded-bg px-200 py-2 text-body text-target-funded-fg">
        <Icon name="check_circle" />
        <span>Every target is funded this month.</span>
      </div>
    );
  }

  const notes = [
    counts.hidden > 0 && `${counts.hidden} hidden included.`,
    counts.snoozed > 0 && `${counts.snoozed} snoozed not counted.`,
  ].filter(Boolean);
  const showingUnderfunded = filter === "underfunded";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-200 gap-y-2 rounded-lg bg-target-underfunded-bg px-200 py-2 text-target-underfunded-fg"
    >
      <Icon name="error" />
      <div className="min-w-0 flex-1 text-body">
        {counts.count > 0 && (
          <>
            <strong>{fmt(totals.needed)}</strong> still needed across {counts.count}{" "}
            {counts.count === 1 ? "category" : "categories"}
          </>
        )}
        {totals.overspending > 0 && (
          <>
            {counts.count > 0 ? ", plus " : ""}
            <strong>{fmt(totals.overspending)}</strong> overspending to cover
          </>
        )}
        .
        {notes.length > 0 && <span className="block text-small opacity-80">{notes.join(" ")}</span>}
      </div>
      {counts.count > 0 && (
        <Link
          href={budgetHref(month, showingUnderfunded ? "all" : "underfunded")}
          className="rounded border border-current px-3 py-1 text-body font-medium hover:bg-neutral-0/50"
        >
          {showingUnderfunded ? "Show all" : "Show only these"}
        </Link>
      )}
    </div>
  );
}

/**
 * The quick filters with their counts (#171): All · Snoozed · Underfunded ·
 * Overfunded · Money Available. Links, so the filter lives in the URL next
 * to the month. On phones they scroll in one row.
 */
export function QuickFilterBar({
  counts,
  month,
  filter,
}: {
  counts: Record<QuickFilter, number>;
  month: string;
  filter: QuickFilter;
}) {
  return (
    <nav aria-label="Quick filters" className="-mx-200 overflow-x-auto px-200 pb-1 sm:mx-0 sm:px-0">
      <ul className="flex gap-2 sm:flex-wrap">
        {QUICK_FILTERS.map(({ key, label }) => {
          const active = key === filter;
          return (
            <li key={key} className="shrink-0">
              <Link
                href={budgetHref(month, key)}
                aria-current={active ? "page" : undefined}
                className={
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-3 py-1.5 text-body font-medium " +
                  (active
                    ? "border-brand-700 bg-target-overfunded-bg text-target-overfunded-fg"
                    : "border-transparent bg-neutral-200/60 text-neutral-800 hover:bg-neutral-200")
                }
              >
                {label}
                <span
                  className={
                    "min-w-6 rounded-full px-1.5 text-center text-small tabular-nums " +
                    (active ? "bg-neutral-0" : "bg-neutral-100")
                  }
                >
                  {counts[key]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

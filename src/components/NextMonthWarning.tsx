import Link from "next/link";
import { MoveMoneyPopover } from "@/components/MoveMoneyPopover";
import { monthDateRange, parseBudgetMonth } from "@/lib/budgetMonth";
import { formatMilliunits } from "@/lib/money";
import type { NextMonthWarning as NextMonthWarningData } from "@/lib/nextMonthWarning";
import { FILTER_PARAMS, UNCATEGORIZED } from "@/lib/transactionFilters";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

/** An amount that never reorders next to right-to-left text. */
function Amount({ milliunits, currency }: { milliunits: number; currency: string }) {
  return <bdi dir="ltr">{formatMilliunits(milliunits, currency)}</bdi>;
}

/** The red dot on the Ready to Assign pill (#183). Colour isn't the only signal. */
export function NextMonthWarningDot() {
  return (
    <span
      title="Next month will start negative"
      aria-label="Next month will start negative"
      className="inline-block size-2 shrink-0 rounded-full bg-danger"
    />
  );
}

/** Uncategorized has no Move Money popover, so the callout links to its
 * transactions for the viewed month, the same filter Activity uses. */
function uncategorizedHref(month: string): string {
  const parsed = parseBudgetMonth(month);
  const params = new URLSearchParams({ [FILTER_PARAMS.category]: UNCATEGORIZED });
  if (parsed) {
    const { from, to } = monthDateRange(parsed);
    params.set(FILTER_PARAMS.dateFrom, from);
    params.set(FILTER_PARAMS.dateTo, to);
  }
  return `/accounts/all?${params.toString()}`;
}

/**
 * The red callout under the Ready to Assign Breakdown (#183): next month's
 * figure, why, and the cash-overspent categories. Each opens Move Money;
 * Uncategorized links to its transactions. "+N more" is the rest of the
 * list, not another action.
 */
export function NextMonthWarningCallout({
  warning,
  month,
  monthName,
  nextMonthName,
  currency,
  categoryOptions,
  transferAvailable,
}: {
  warning: NextMonthWarningData | null;
  month: string;
  monthName: string;
  nextMonthName: string;
  currency: string;
  categoryOptions: GroupOption[];
  transferAvailable: (formData: FormData) => Promise<void>;
}) {
  if (!warning) return null;

  const availableById = new Map(
    categoryOptions.flatMap((group) => group.categories.map((category) => [category.id, category.available])),
  );

  return (
    <section
      aria-label="Next month warning"
      className="mt-300 rounded-lg bg-target-overspent-bg p-200 text-body text-target-overspent-fg"
    >
      <p className="font-semibold">
        {nextMonthName} will start at −<Amount milliunits={Math.abs(warning.nextReadyToAssign)} currency={currency} />
      </p>
      <p className="mt-1">
        <Amount milliunits={warning.cashOverspending} currency={currency} /> of cash overspending in {monthName} comes
        out of {nextMonthName}&apos;s Ready to Assign. Move money from other categories to cover it.
      </p>
      {warning.categories.length > 0 && (
        <ul className="mt-2 space-y-1">
          {warning.categories.map((category) => (
            <li key={category.id}>
              {category.uncategorized ? (
                <Link
                  href={uncategorizedHref(month)}
                  className="flex items-center justify-between gap-2 rounded-sm px-1 py-1 hover:bg-neutral-0/60"
                >
                  <span>{category.name}</span>
                  <span className="tabular-nums">
                    <Amount milliunits={category.cashOverspending} currency={currency} />
                  </span>
                </Link>
              ) : (
                <MoveMoneyPopover
                  categoryId={category.id}
                  categoryName={category.name}
                  month={month}
                  currency={currency}
                  available={availableById.get(category.id) ?? -category.cashOverspending}
                  groups={categoryOptions}
                  transferAvailable={transferAvailable}
                  triggerClassName="flex w-full items-center justify-between gap-2 rounded-sm px-1 py-1 text-left text-body text-target-overspent-fg hover:bg-neutral-0/60"
                  trigger={
                    <>
                      <span>{category.name}</span>
                      <span className="tabular-nums">
                        <Amount milliunits={category.cashOverspending} currency={currency} />
                      </span>
                    </>
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {warning.moreCount > 0 && <p className="mt-1 px-1 text-small">+{warning.moreCount} more</p>}
    </section>
  );
}

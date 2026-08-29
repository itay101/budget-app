"use client";

import { Icon } from "@/components/Icon";

type CategoryOption = { id: string; name: string };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

/** Sentinel value for the "Uncategorized" option — distinct from "" (which
 * a <select> uses for "All categories"), and from any real category id. */
export const UNCATEGORIZED = "__uncategorized__";

/**
 * The category-filter dropdown shown above the transactions table (see
 * TransactionsTable), next to DateRangeFilter. Reuses the same grouped
 * category-group data the per-row category <select> is built from
 * (`categoryGroups`, from getTransactionEditOptions) so the filter's
 * options always match what's actually assignable.
 */
export function CategoryFilter({
  categoryGroups,
  value,
  onChange,
}: {
  categoryGroups: GroupOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const hasFilter = value !== "";

  return (
    <div className="relative">
      <Icon
        name="sell"
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[1.1em] text-inherit"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter by category"
        className={
          "appearance-none rounded border py-1 pl-7 pr-6 text-small " +
          (hasFilter
            ? "border-brand-700 bg-brand-700/10 text-brand-700"
            : "border-neutral-200 text-neutral-600 hover:bg-neutral-100")
        }
      >
        <option value="">All categories</option>
        <option value={UNCATEGORIZED}>Uncategorized</option>
        {categoryGroups.map((group) => (
          <optgroup key={group.id} label={group.name}>
            {group.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <Icon
        name="expand_more"
        className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[1.1em] text-inherit"
      />
    </div>
  );
}

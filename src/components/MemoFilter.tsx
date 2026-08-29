"use client";

import { Icon } from "@/components/Icon";

/**
 * Free-text filter shown above the transactions table (see
 * TransactionsTable, ticket #22), alongside the date, category, and
 * flow filters. Matches case-insensitively against a transaction's memo
 * or payee name - the actual substring match happens in
 * TransactionsTable, this just owns the input.
 */
export function MemoFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const hasFilter = value !== "";

  return (
    <div className="relative">
      <Icon
        name="search"
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[1.1em] text-inherit"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search memo or payee"
        aria-label="Filter by memo or payee"
        className={
          "w-44 rounded border py-1 pl-8 pr-6 text-small placeholder:text-neutral-400 focus:outline-none " +
          (hasFilter
            ? "border-brand-700 bg-brand-700/10 text-brand-700"
            : "border-neutral-200 text-neutral-600 hover:bg-neutral-100")
        }
      />
      {hasFilter && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Clear search"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-inherit hover:bg-neutral-0/50"
        >
          <Icon name="close" className="text-[1.1em]" label="Clear search" />
        </button>
      )}
    </div>
  );
}

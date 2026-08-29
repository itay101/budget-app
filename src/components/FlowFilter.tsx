"use client";

export type FlowFilterValue = "all" | "inflow" | "outflow";

const OPTIONS: { key: FlowFilterValue; label: string }[] = [
  { key: "all", label: "All" },
  { key: "inflow", label: "Inflow" },
  { key: "outflow", label: "Outflow" },
];

/**
 * The Inflow/Outflow filter shown above the transactions table (see
 * TransactionsTable, ticket #21). Unlike DateRangeFilter/CategoryFilter
 * this has no sub-fields worth hiding behind a popover - it's a plain
 * three-way segmented toggle, "All" being the default/unfiltered state.
 */
export function FlowFilter({
  value,
  onChange,
}: {
  value: FlowFilterValue;
  onChange: (value: FlowFilterValue) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by inflow or outflow"
      className="flex overflow-hidden rounded border border-neutral-200 text-small"
    >
      {OPTIONS.map((option, i) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={value === option.key}
          className={
            "px-2 py-1 " +
            (i > 0 ? "border-l border-neutral-200 " : "") +
            (value === option.key
              ? "bg-brand-700 text-white"
              : "text-neutral-600 hover:bg-neutral-100")
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

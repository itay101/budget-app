"use client";

type CategoryOption = { id: string; name: string };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

/**
 * The category `<select>`/`<optgroup>` markup shared by TransactionRow's
 * edit mode and NewTransactionRow (see TransactionsTable) - both build the
 * same grouped list of options from `categoryGroups`, differing only in
 * whether the row can be recategorized at all. `disabled` folds in
 * TransactionRow's starting-balance guard (a starting-balance transaction
 * can't be recategorized) as a parameter rather than an assumption baked
 * into the markup, so NewTransactionRow - which has no such guard - can
 * reuse the same component by just not passing it.
 */
export function CategoryOptions({
  groups,
  value,
  onChange,
  disabled = false,
  disabledLabel = "Uncategorized",
  disabledTitle,
  className,
}: {
  groups: GroupOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  disabledLabel?: string;
  disabledTitle?: string;
  className?: string;
}) {
  if (disabled) {
    return (
      <div className={className + " text-neutral-400"} title={disabledTitle}>
        {disabledLabel}
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">Uncategorized</option>
      {groups.map((group) => (
        <optgroup key={group.id} label={group.name}>
          {group.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

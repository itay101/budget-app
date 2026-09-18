"use client";

import { useTransition } from "react";
import { createPortal } from "react-dom";
import { formatMilliunits } from "@/lib/money";
import { MoneyInput } from "@/components/MoneyInput";
import { usePopover } from "@/components/usePopover";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

/**
 * The "Available" figure for a category, rendered as a button that opens a
 * small popover (YNAB-style) for moving that money into another category —
 * click the amount, enter how much and where, done. No restriction on the
 * source going negative; see the `transferAvailable` action.
 */
export function MoveMoneyPopover({
  categoryId,
  categoryName,
  month,
  currency,
  available,
  groups,
  transferAvailable,
}: {
  categoryId: string;
  categoryName: string;
  month: string;
  currency: string;
  available: number;
  groups: GroupOption[];
  transferAvailable: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const { open, setOpen, position, triggerRef, panelRef } = usePopover({
    width: 256, // matches the popover's w-64
    align: "right",
  });

  const hasOtherCategories = groups.some((group) =>
    group.categories.some((c) => c.id !== categoryId),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await transferAvailable(formData);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={!hasOtherCategories}
        onClick={() => setOpen((o) => !o)}
        title={hasOtherCategories ? "Move money" : undefined}
        className={
          "w-full rounded px-1 py-0.5 text-right font-medium " +
          (available < 0 ? "text-danger" : "text-success") +
          (hasOtherCategories ? " hover:bg-neutral-100" : " cursor-default")
        }
      >
        {formatMilliunits(available, currency)}
      </button>

      {open &&
        hasOtherCategories &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-neutral-200 bg-neutral-0 p-3 text-left shadow-lg"
          >
            <p className="mb-2 text-small font-medium text-neutral-800">
              Move money from {categoryName}
            </p>
            <form onSubmit={handleSubmit} className="space-y-2">
              <input type="hidden" name="fromCategoryId" value={categoryId} />
              <input type="hidden" name="month" value={month} />
              <div>
                <label
                  className="block text-small text-neutral-600"
                  htmlFor={`amount-${categoryId}`}
                >
                  Amount
                </label>
                <MoneyInput
                  id={`amount-${categoryId}`}
                  name="amount"
                  currency={currency}
                  min="0.01"
                  required
                  autoFocus
                  className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                />
              </div>
              <div>
                <label
                  className="block text-small text-neutral-600"
                  htmlFor={`to-${categoryId}`}
                >
                  To
                </label>
                <select
                  id={`to-${categoryId}`}
                  name="toCategoryId"
                  required
                  className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                >
                  {groups.map((group) => {
                    const options = group.categories.filter(
                      (c) => c.id !== categoryId,
                    );
                    if (options.length === 0) return null;
                    return (
                      <optgroup key={group.id} label={group.name}>
                        {options.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {formatMilliunits(c.available, currency)}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                >
                  {pending ? "Moving…" : "Move"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}

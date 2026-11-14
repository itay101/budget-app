"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { formatMilliunits } from "@/lib/money";
import { READY_TO_ASSIGN } from "@/lib/readyToAssign";
import { MoneyInput } from "@/components/MoneyInput";
import { AvailableOptions } from "@/components/AvailableOptions";
import { useReadyToAssign } from "@/components/ReadyToAssignContext";
import { usePopover } from "@/components/usePopover";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

type Direction = "out" | "in";

/**
 * The "Available" figure for a category, rendered as a button that opens a
 * small popover (YNAB-style) for Move Money: click the amount, enter how
 * much and where, done.
 *
 * "Out of" (the default) moves money from this category to another one or
 * back to Ready to Assign. "Into" pulls money into this category from Ready
 * to Assign or another category (#217, amending #134). Ready to Assign, the
 * viewed month's figure, is always the first option, so the button is
 * always enabled. Nothing stops either side going negative; see the
 * `transferAvailable` action.
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
  const readyToAssign = useReadyToAssign();
  const [direction, setDirection] = useState<Direction>("out");
  const { open, setOpen, position, triggerRef, panelRef } = usePopover({
    width: 256, // matches the popover's w-64
    align: "right",
    onDismiss: () => setDirection("out"),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // The select picks the other side; the switch decides which side it is.
    const other = String(formData.get("other") ?? "");
    formData.delete("other");
    formData.set("fromCategoryId", direction === "out" ? categoryId : other);
    formData.set("toCategoryId", direction === "out" ? other : categoryId);
    startTransition(async () => {
      await transferAvailable(formData);
      setOpen(false);
      setDirection("out");
    });
  }

  const selectLabel = direction === "out" ? "To" : "From";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Move money"
        className={
          "w-full rounded-sm px-1 py-0.5 text-right font-medium hover:bg-neutral-100 " +
          (available < 0 ? "text-danger" : "text-success")
        }
      >
        {formatMilliunits(available, currency)}
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`Move money for ${categoryName}`}
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-neutral-200 bg-neutral-0 p-3 text-left shadow-lg"
          >
            <div
              role="radiogroup"
              aria-label="Direction"
              className="mb-2 grid grid-cols-2 gap-1 rounded-sm bg-neutral-100 p-0.5 text-small"
            >
              {(["out", "in"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={direction === value}
                  onClick={() => setDirection(value)}
                  className={
                    "truncate rounded-sm px-2 py-1 font-medium " +
                    (direction === value
                      ? "bg-neutral-0 text-neutral-800 shadow-sm"
                      : "text-neutral-600 hover:text-neutral-800")
                  }
                >
                  {value === "out" ? "Out of" : "Into"} <bdi>{categoryName}</bdi>
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="space-y-2">
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
                  className="mt-1 w-full rounded-sm border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-hidden focus:ring-1 focus:ring-brand-700"
                />
              </div>
              <div>
                <label
                  className="block text-small text-neutral-600"
                  htmlFor={`other-${categoryId}`}
                >
                  {selectLabel}
                </label>
                <select
                  id={`other-${categoryId}`}
                  name="other"
                  required
                  className="mt-1 w-full rounded-sm border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-hidden focus:ring-1 focus:ring-brand-700"
                >
                  {readyToAssign !== null && (
                    <option value={READY_TO_ASSIGN}>
                      Ready to Assign: {formatMilliunits(readyToAssign, currency)}
                    </option>
                  )}
                  <AvailableOptions groups={groups} currency={currency} exclude={categoryId} />
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setDirection("out");
                  }}
                  className="rounded-sm px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-sm bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
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

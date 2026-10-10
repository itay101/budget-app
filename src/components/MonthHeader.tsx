"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { usePopover } from "@/components/usePopover";
import {
  addMonths,
  formatBudgetMonth,
  isInRange,
  monthLabel,
  parseBudgetMonth,
  type BudgetMonthRange,
} from "@/lib/budgetMonth";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function hrefFor(month: Date): string {
  return `/budget?month=${formatBudgetMonth(month)}`;
}

/**
 * The budget page's month switcher (#124, header design from #136):
 * `‹ Oct 2026 ▾ ›`. The arrows step one month and stop at the budget's
 * navigable range; the label opens a one-year month grid where months
 * outside the range are greyed out and the current month has a ring. Away
 * from the current month, a "Back to {month}" link appears.
 *
 * Months are passed as `YYYY-MM` strings so the server component can hand
 * them over without serializing Dates.
 */
export function MonthHeader({
  month: monthKey,
  current: currentKey,
  first: firstKey,
  last: lastKey,
}: {
  month: string;
  current: string;
  first: string;
  last: string;
}) {
  const month = parseBudgetMonth(monthKey)!;
  const current = parseBudgetMonth(currentKey)!;
  const range = { first: parseBudgetMonth(firstKey)!, last: parseBudgetMonth(lastKey)! };
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);

  // 288 matches the panel's w-72.
  const { open, setOpen, position, triggerRef, panelRef } = usePopover({ width: 288 });
  const [gridYear, setGridYear] = useState(month.getUTCFullYear());

  return (
    <div className="flex items-center gap-1">
      <StepLink to={prev} range={range} label="Previous month" icon="chevron_left" />
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setGridYear(month.getUTCFullYear());
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1 rounded px-2 py-1 text-h3 text-neutral-800 hover:bg-neutral-100"
      >
        {monthLabel(month, "short")}
        <Icon name="arrow_drop_down" />
      </button>
      <StepLink to={next} range={range} label="Next month" icon="chevron_right" />
      {monthKey !== currentKey && (
        <Link
          href={hrefFor(current)}
          className="ms-2 whitespace-nowrap rounded px-2 py-1 text-small font-medium text-brand-700 hover:bg-brand-700/10"
        >
          Back to {monthLabel(current, "short")}
        </Link>
      )}

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Choose a month"
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="z-50 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-neutral-200 bg-neutral-0 p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setGridYear((y) => y - 1)}
                disabled={gridYear <= range.first.getUTCFullYear()}
                aria-label="Previous year"
                className="rounded p-1 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
              >
                <Icon name="chevron_left" />
              </button>
              <span className="text-body font-semibold text-neutral-800">{gridYear}</span>
              <button
                type="button"
                onClick={() => setGridYear((y) => y + 1)}
                disabled={gridYear >= range.last.getUTCFullYear()}
                aria-label="Next year"
                className="rounded p-1 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
              >
                <Icon name="chevron_right" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {MONTH_NAMES.map((name, i) => (
                <MonthCell
                  key={name}
                  month={new Date(Date.UTC(gridYear, i, 1))}
                  name={name}
                  viewedKey={monthKey}
                  currentKey={currentKey}
                  range={range}
                  onPick={() => setOpen(false)}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function StepLink({
  to,
  range,
  label,
  icon,
}: {
  to: Date;
  range: BudgetMonthRange;
  label: string;
  icon: string;
}) {
  const enabled = isInRange(to, range);
  return (
    <Link
      href={hrefFor(to)}
      aria-label={label}
      aria-disabled={!enabled}
      tabIndex={enabled ? undefined : -1}
      className="flex h-8 w-8 items-center justify-center rounded text-neutral-600 hover:bg-neutral-100 aria-disabled:pointer-events-none aria-disabled:opacity-40"
    >
      <Icon name={icon} />
    </Link>
  );
}

type CellState = "disabled" | "selected" | "normal";

const CELL_LOOK: Record<CellState, string> = {
  disabled: "pointer-events-none text-neutral-600 opacity-40",
  selected: "bg-brand-700 font-semibold text-white",
  normal: "text-neutral-800 hover:bg-neutral-100",
};

function cellState(month: Date, key: string, viewedKey: string, range: BudgetMonthRange): CellState {
  if (!isInRange(month, range)) return "disabled";
  return key === viewedKey ? "selected" : "normal";
}

/** One month in the picker grid: a link when it's in range, greyed out
 * otherwise; the viewed month is filled and the current one has a ring. */
function MonthCell({
  month,
  name,
  viewedKey,
  currentKey,
  range,
  onPick,
}: {
  month: Date;
  name: string;
  viewedKey: string;
  currentKey: string;
  range: BudgetMonthRange;
  onPick: () => void;
}) {
  const key = formatBudgetMonth(month);
  const state = cellState(month, key, viewedKey, range);
  const ring = key === currentKey && state !== "selected" ? " ring-2 ring-inset ring-brand-700" : "";
  const className = `rounded py-1.5 text-center text-body ${CELL_LOOK[state]}${ring}`;
  if (state === "disabled") {
    return (
      <span aria-disabled="true" className={className}>
        {name}
      </span>
    );
  }
  return (
    <Link
      href={hrefFor(month)}
      onClick={onPick}
      aria-current={state === "selected" ? "date" : undefined}
      className={className}
    >
      {name}
    </Link>
  );
}

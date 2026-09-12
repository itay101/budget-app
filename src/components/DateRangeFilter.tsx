"use client";

import { createPortal } from "react-dom";
import { DATE_RANGE_PRESETS, DateRangePreset } from "@/lib/dateRange";
import { Icon } from "@/components/Icon";
import { usePopover } from "@/components/usePopover";

const fieldClass =
  "mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700";

// "2026-08-27" -> "Aug 27"
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function triggerLabel(
  dateFrom: string,
  dateTo: string,
  activePreset: DateRangePreset | null,
): string {
  if (activePreset) {
    return DATE_RANGE_PRESETS.find((p) => p.key === activePreset)!.label;
  }
  if (dateFrom && dateTo) return `${shortDate(dateFrom)} – ${shortDate(dateTo)}`;
  if (dateFrom) return `From ${shortDate(dateFrom)}`;
  if (dateTo) return `Through ${shortDate(dateTo)}`;
  return "Date range";
}

/**
 * The date-filter trigger + popover shown above the transactions table
 * (see TransactionsTable). Follows the same anchored-popover pattern as
 * AddAccountPopover - a portal'd panel positioned under the trigger
 * button, dismissed on outside click, Escape, scroll, or resize.
 */
export function DateRangeFilter({
  dateFrom,
  dateTo,
  activePreset,
  onPresetChange,
  onDateFromChange,
  onDateToChange,
  onClear,
}: {
  dateFrom: string;
  dateTo: string;
  activePreset: DateRangePreset | null;
  onPresetChange: (preset: DateRangePreset) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClear: () => void;
}) {
  const { open, setOpen, position, triggerRef, panelRef } = usePopover({
    width: 288, // matches the popover's w-72
    align: "right",
  });

  const hasFilter = dateFrom !== "" || dateTo !== "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          "flex items-center gap-1 rounded border px-2 py-1 text-small " +
          (hasFilter
            ? "border-brand-700 bg-brand-700/10 text-brand-700"
            : "border-neutral-200 text-neutral-600 hover:bg-neutral-100")
        }
      >
        <Icon name="date_range" className="text-[1.1em]" />
        {triggerLabel(dateFrom, dateTo, activePreset)}
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="z-50 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-neutral-200 bg-neutral-0 p-3 text-left shadow-lg"
          >
            <p className="mb-2 text-small font-medium text-neutral-800">
              Date range
            </p>

            <div className="flex flex-wrap gap-1">
              {DATE_RANGE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onPresetChange(p.key)}
                  className={
                    "rounded-full px-2 py-0.5 text-small " +
                    (activePreset === p.key
                      ? "bg-brand-700 text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200")
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <div className="min-w-0 flex-1">
                <label
                  className="block text-small text-neutral-600"
                  htmlFor="date-filter-from"
                >
                  From
                </label>
                <input
                  id="date-filter-from"
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => onDateFromChange(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div className="min-w-0 flex-1">
                <label
                  className="block text-small text-neutral-600"
                  htmlFor="date-filter-to"
                >
                  To
                </label>
                <input
                  id="date-filter-to"
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => onDateToChange(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              {hasFilter && (
                <button
                  type="button"
                  onClick={onClear}
                  className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800"
              >
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

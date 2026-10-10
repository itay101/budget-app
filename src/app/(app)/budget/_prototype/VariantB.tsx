"use client";

// PROTOTYPE ONLY (issue #136). Variant B: one compact sticky toolbar. The
// month label opens a year/month picker grid; Ready to Assign is a pill on
// the right that opens a side drawer (a bottom sheet on phones) holding the
// breakdown and the Assign form together.

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import {
  AssignFromRtaForm,
  MonthBreakdown,
  Money,
  MonthArrow,
  monthLabel,
  useHeaderModel,
  type Palette,
  type VariantProps,
} from "./shared";

export const variantBName = "Sticky toolbar + drawer";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function VariantB(props: VariantProps) {
  const { month, currentMonth, currency, state, groups } = props;
  const { p, s, copy, total, href, prev, next } = useHeaderModel(props);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(Number(month.slice(0, 4)));
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div
        className={`sticky top-0 z-30 -mx-200 flex flex-wrap items-center gap-2 border-b px-200 py-2 sm:mx-0 sm:rounded-lg sm:border ${p.surface} ${p.border}`}
      >
        <div className="relative flex items-center">
          <MonthArrow
            target={prev}
            href={href}
            icon="chevron_left"
            label="Previous month"
            className={`rounded ${p.subtle} ${p.hover}`}
          />
          <button
            type="button"
            onClick={() => {
              setPickerYear(Number(month.slice(0, 4)));
              setPickerOpen((o) => !o);
            }}
            className={`flex items-center gap-1 rounded px-2 py-1 text-h3 ${p.text} ${p.hover}`}
          >
            {monthLabel(month, "short")}
            <Icon name="arrow_drop_down" />
          </button>
          <MonthArrow
            target={next}
            href={href}
            icon="chevron_right"
            label="Next month"
            className={`rounded ${p.subtle} ${p.hover}`}
          />

          {pickerOpen && (
            <div
              className={`absolute left-0 top-full z-40 mt-1 w-64 rounded-lg border p-2 shadow-lg ${p.surface} ${p.border}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPickerYear((y) => y - 1)}
                  className={`rounded px-2 ${p.subtle} ${p.hover}`}
                >
                  ‹
                </button>
                <span className={`font-medium ${p.text}`}>{pickerYear}</span>
                <button
                  type="button"
                  onClick={() => setPickerYear((y) => y + 1)}
                  className={`rounded px-2 ${p.subtle} ${p.hover}`}
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {MONTHS.map((label, i) => (
                  <PickerCell
                    key={label}
                    {...props}
                    m={`${pickerYear}-${String(i + 1).padStart(2, "0")}`}
                    label={label}
                    onPick={() => setPickerOpen(false)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {month !== currentMonth && (
          <Link
            href={href(currentMonth)}
            scroll={false}
            className={`rounded px-2 py-1 text-small ${p.subtle} ${p.hover}`}
          >
            Back to {monthLabel(currentMonth, "short")}
          </Link>
        )}

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`ml-auto flex items-center gap-2 rounded-full px-3 py-1 ring-1 ${s.box} ${s.ring}`}
        >
          <Icon name={copy.icon} filled className={`text-[18px] ${s.fg}`} />
          <span className={`text-h3 font-semibold ${s.fg}`}>
            <Money amount={total} currency={currency} />
          </span>
          <span className={`hidden text-small font-medium md:inline ${s.fg}`}>
            {copy.label}
          </span>
        </button>
      </div>

      {drawerOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 sm:items-stretch">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 cursor-default"
              onClick={() => setDrawerOpen(false)}
            />
            <div
              className={`relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl p-300 shadow-2xl sm:max-h-none sm:w-96 sm:rounded-none ${p.surface}`}
            >
              <div className="mb-300 flex items-start justify-between gap-2">
                <div>
                  <p className={`text-small ${p.subtle}`}>
                    {monthLabel(month)}
                  </p>
                  <p className={`text-display font-semibold ${s.fg}`}>
                    <Money amount={total} currency={currency} />
                  </p>
                  <p className={`text-body font-medium ${s.fg}`}>
                    {copy.label}
                  </p>
                  <p className={`text-small ${p.subtle}`}>{copy.hint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className={`rounded p-1 ${p.subtle} ${p.hover}`}
                  aria-label="Close"
                >
                  <Icon name="close" />
                </button>
              </div>

              <h2
                className={`mb-2 text-small font-medium uppercase tracking-wide ${p.subtle}`}
              >
                Breakdown
              </h2>
              <MonthBreakdown {...props} p={p} />

              <DrawerAssign {...props} p={p} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function DrawerAssign(props: VariantProps & { p: Palette }) {
  const { past, p } = props;
  if (past) return null;
  return (
    <>
      <h2
        className={`mb-2 mt-300 text-small font-medium uppercase tracking-wide ${p.subtle}`}
      >
        Assign money
      </h2>
      <AssignFromRtaForm {...props} autoFocus={false} />
    </>
  );
}

function cellClass(selected: boolean, isToday: boolean, p: Palette) {
  const base = "rounded py-1 text-center text-small";
  if (selected) return `${base} ${p.button}`;
  return `${base} ${p.text} ${p.hover} ${isToday ? "ring-1 ring-brand-700" : ""}`;
}

function PickerCell(
  props: VariantProps & { m: string; label: string; onPick: () => void },
) {
  const { m, label, month, currentMonth, minMonth, maxMonth, onPick } = props;
  const { p, href } = useHeaderModel(props);
  if (m < minMonth || m > maxMonth) {
    return (
      <span
        className={`rounded py-1 text-center text-small opacity-30 ${p.subtle}`}
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href(m)}
      scroll={false}
      onClick={onPick}
      className={cellClass(m === month, m === currentMonth, p)}
    >
      {label}
    </Link>
  );
}

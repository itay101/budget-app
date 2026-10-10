"use client";

// PROTOTYPE ONLY (issue #136). Variant A: YNAB-style. Month nav on the left,
// a big centered Ready to Assign box that opens a popover with the breakdown
// and an Assign button.

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { usePopover } from "@/components/usePopover";
import {
  AssignFromRtaForm,
  BreakdownLines,
  Money,
  MonthArrow,
  monthLabel,
  useHeaderModel,
  type Palette,
  type VariantProps,
} from "./shared";

export const variantAName = "YNAB box + popover";

export function VariantA(props: VariantProps) {
  const { currency, theme } = props;
  const { p, s, copy, total } = useHeaderModel(props);
  const [mode, setMode] = useState<"breakdown" | "assign">("breakdown");
  const { open, setOpen, position, triggerRef, panelRef } = usePopover({
    width: 320,
    onDismiss: () => setMode("breakdown"),
  });

  return (
    <div className={`rounded-lg p-200 ${theme === "dark" ? p.page : ""}`}>
      <div className="flex flex-col items-stretch gap-200 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <MonthNavA {...props} />

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center justify-between gap-200 rounded-lg px-300 py-200 ring-1 sm:min-w-[22rem] ${s.box} ${s.ring}`}
        >
          <div className="text-left">
            <div className={`text-display font-semibold ${s.fg}`}>
              <Money amount={total} currency={currency} />
            </div>
            <div
              className={`flex items-center gap-1 text-body font-medium ${s.fg}`}
            >
              <Icon name={copy.icon} filled className="text-[18px]" />
              {copy.label}
            </div>
          </div>
          <Icon name="expand_more" className={s.fg} />
        </button>

        <div className="hidden sm:block" />
      </div>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
            }}
            className={`z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg border p-3 shadow-lg ${p.surface} ${p.border}`}
          >
            <PopoverBody {...props} p={p} mode={mode} setMode={setMode} />
          </div>,
          document.body,
        )}
    </div>
  );
}

function MonthNavA(props: VariantProps) {
  const { month, currentMonth } = props;
  const { p, href, prev, next } = useHeaderModel(props);
  return (
    <div className="flex items-center justify-center gap-1 sm:justify-start">
      <MonthArrow
        target={prev}
        href={href}
        icon="chevron_left"
        label="Previous month"
        className={`rounded-full ${p.subtle} ${p.hover}`}
      />
      <h1 className={`min-w-[10rem] text-center text-h3 sm:text-h2 ${p.text}`}>
        {monthLabel(month, "short")}
      </h1>
      <MonthArrow
        target={next}
        href={href}
        icon="chevron_right"
        label="Next month"
        className={`rounded-full ${p.subtle} ${p.hover}`}
      />
      {month !== currentMonth && (
        <Link
          href={href(currentMonth)}
          scroll={false}
          className={`ml-1 rounded border px-2 py-0.5 text-small ${p.border} ${p.subtle} ${p.hover}`}
        >
          Today
        </Link>
      )}
    </div>
  );
}

function PopoverBody(
  props: VariantProps & {
    p: Palette;
    mode: "breakdown" | "assign";
    setMode: (mode: "breakdown" | "assign") => void;
  },
) {
  const { month, currency, state, groups, p, mode, setMode } = props;
  return mode === "breakdown" ? (
    <>
      <p className={`mb-2 text-small font-medium ${p.text}`}>
        Ready to Assign Breakdown
      </p>
      <BreakdownLines month={month} currency={currency} state={state} p={p} />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setMode("assign")}
          className={`rounded px-2 py-1 text-small font-medium ${p.button}`}
        >
          Assign…
        </button>
      </div>
    </>
  ) : (
    <>
      <p className={`mb-2 text-small font-medium ${p.text}`}>
        Assign from Ready to Assign
      </p>
      <AssignFromRtaForm
        month={month}
        currency={currency}
        state={state}
        groups={groups}
        p={p}
        onDone={() => setMode("breakdown")}
      />
    </>
  );
}

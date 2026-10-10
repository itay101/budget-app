"use client";

// PROTOTYPE ONLY (issue #136). Variant C: no popover. A month summary card
// with the month title flanked by big arrows, the Ready to Assign state on
// one side and the breakdown always visible on the other, like a receipt.
// Assigning expands inline under it. On phones the breakdown folds away.

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import {
  AssignFromRtaForm,
  MonthBreakdown,
  Money,
  monthLabel,
  useHeaderModel,
  type Palette,
  type VariantProps,
} from "./shared";

const VISIBILITY: Record<string, string> = { true: "block", false: "hidden" };

export const variantCName = "Summary card, inline breakdown";

export function VariantC(props: VariantProps) {
  const { month, currency, state, groups } = props;
  const { p, s, copy, total, href, prev, next } = useHeaderModel(props);
  const [assignOpen, setAssignOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  return (
    <section
      className={`overflow-hidden rounded-lg border ${p.surface} ${p.border}`}
    >
      <header
        className={`flex items-center justify-between border-b px-200 py-2 ${p.border}`}
      >
        <SideLink target={prev} href={href} p={p} back />
        <TitleC {...props} />
        <SideLink target={next} href={href} p={p} />
      </header>

      <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={`flex flex-col justify-center gap-2 p-300 ${s.box}`}>
          <div
            className={`flex items-center gap-2 text-body font-medium ${s.fg}`}
          >
            <Icon name={copy.icon} filled />
            {copy.label}
          </div>
          <div className={`text-display font-semibold ${s.fg}`}>
            <Money amount={total} currency={currency} />
          </div>
          <p className={`text-small ${s.fg} opacity-80`}>{copy.hint}</p>
          <div className="mt-1 flex gap-2">
            <ToggleButton
              open={assignOpen}
              onToggle={() => setAssignOpen((o) => !o)}
              labels={["Assign money", "Close"]}
              className={`font-medium ${props.past ? "hidden" : ""} ${p.button}`}
            />
            <ToggleButton
              open={breakdownOpen}
              onToggle={() => setBreakdownOpen((o) => !o)}
              labels={["Breakdown", "Hide breakdown"]}
              className={`sm:hidden ${p.subtle} ${p.hover}`}
            />
          </div>
        </div>

        <div className={`${VISIBILITY[String(breakdownOpen)]} p-300 sm:block`}>
          <MonthBreakdown {...props} p={p} compact />
        </div>
      </div>

      {assignOpen && (
        <div className={`border-t px-300 py-200 ${p.border}`}>
          <div className="max-w-md">
            <AssignFromRtaForm
              month={month}
              currency={currency}
              state={state}
              groups={groups}
              p={p}
              onDone={() => setAssignOpen(false)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function SideLink({
  target,
  href,
  p,
  back = false,
}: {
  target: string | null;
  href: (month: string) => string;
  p: Palette;
  back?: boolean;
}) {
  if (!target) return <span className="w-8" />;
  return (
    <Link
      href={href(target)}
      scroll={false}
      className={`flex items-center gap-1 rounded px-2 py-1 text-small ${back ? "" : "flex-row-reverse"} ${p.subtle} ${p.hover}`}
    >
      <Icon name={back ? "arrow_back" : "arrow_forward"} />
      <span className="hidden sm:inline">{monthLabel(target, "short")}</span>
    </Link>
  );
}

function TitleC(props: VariantProps) {
  const { month, currentMonth } = props;
  const { p, href } = useHeaderModel(props);
  return (
    <div className="text-center">
      <h1 className={`text-h2 ${p.text}`}>{monthLabel(month)}</h1>
      {month === currentMonth ? (
        <p className={`text-small ${p.subtle}`}>This month</p>
      ) : (
        <Link
          href={href(currentMonth)}
          scroll={false}
          className="text-small text-brand-700"
        >
          Jump to this month
        </Link>
      )}
    </div>
  );
}

function ToggleButton({
  open,
  onToggle,
  labels,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  labels: [closed: string, open: string];
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded px-3 py-1 text-small ${className}`}
    >
      {labels[Number(open)]}
    </button>
  );
}

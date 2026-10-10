"use client";

/**
 * PROTOTYPE ONLY (issue #136): throwaway Ready to Assign header variants for
 * the budget page. Nothing here is wired to real data or real mutations:
 * the Ready to Assign numbers are stubbed per state, and "Assign" only
 * echoes the `transferAvailable` call it would make. Delete this folder once
 * a variant is picked and rebuilt properly.
 *
 * This file holds what every variant shares on purpose, because it's what
 * the prototype is settling: the state copy, the breakdown lines, the dark
 * palette, and the move-from-Ready-to-Assign form.
 */

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { formatMilliunits, numberToMilliunits } from "@/lib/money";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { monthLabel, monthName, shiftMonth } from "./months";

export { monthLabel } from "./months";

export type RtaState = "positive" | "zero" | "negative";
export type Theme = "light" | "dark";

export type PickerGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string; available: number }[];
};

export type VariantProps = {
  month: string; // YYYY-MM
  currentMonth: string; // today's UTC month
  past: boolean; // month < currentMonth: Ready to Assign shows 0 there
  minMonth: string; // stub navigable range (issue #124's rules)
  maxMonth: string;
  currency: string;
  state: RtaState;
  theme: Theme;
  groups: PickerGroup[];
};

// ---------------------------------------------------------------------------
// Stub numbers. Every scenario's lines add up exactly to its total (ADR 0009):
// "left over" is last month's Ready to Assign *before* this month's and
// future months' assignments are taken off, which is what YNAB shows.
// ---------------------------------------------------------------------------

type Breakdown = {
  leftOver: number;
  inflow: number;
  overspent: number; // <= 0
  assigned: number; // <= 0
  assignedFuture: number; // <= 0
};

const SCENARIOS: Record<RtaState, Breakdown> = {
  positive: {
    leftOver: 4_820_000,
    inflow: 14_500_000,
    overspent: -312_400,
    assigned: -16_750_000,
    assignedFuture: -800_000,
  },
  zero: {
    leftOver: 2_177_280,
    inflow: 18_000_000,
    overspent: 0,
    assigned: -20_177_280,
    assignedFuture: 0,
  },
  negative: {
    leftOver: 0,
    inflow: 12_000_000,
    overspent: -640_900,
    assigned: -12_500_000,
    assignedFuture: -250_000,
  },
};

function breakdownFor(state: RtaState): Breakdown {
  return SCENARIOS[state];
}

function totalOf(b: Breakdown): number {
  return b.leftOver + b.inflow + b.overspent + b.assigned + b.assignedFuture;
}

// ---------------------------------------------------------------------------
// Month helpers (UTC, `YYYY-MM`, per issue #124's resolution).
// ---------------------------------------------------------------------------

/** Link target for another month, keeping the prototype's other params. */
function useMonthHref() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (month: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("month", month);
    return `${pathname}?${next.toString()}`;
  };
}

function monthNav(
  props: Pick<VariantProps, "month" | "minMonth" | "maxMonth">,
) {
  const prev = shiftMonth(props.month, -1);
  const next = shiftMonth(props.month, 1);
  return {
    prev: prev >= props.minMonth ? prev : null,
    next: next <= props.maxMonth ? next : null,
  };
}

// ---------------------------------------------------------------------------
// Copy + colors per state, light and dark. Dark values are Atlassian's dark
// theme tokens, to sit alongside the light ones in tailwind.config.ts.
// ---------------------------------------------------------------------------

const STATE_COPY: Record<
  RtaState,
  { label: string; hint: string; icon: string }
> = {
  positive: {
    label: "Ready to Assign",
    hint: "Give it a job before you spend it",
    icon: "savings",
  },
  zero: {
    label: "All Money Assigned",
    hint: "Every bit of income has a job",
    icon: "check_circle",
  },
  negative: {
    label: "You assigned more than you have",
    hint: "Move money back to Ready to Assign to fix this",
    icon: "error",
  },
};

const PAST_COPY = {
  label: "Ready to Assign",
  hint: "Past month. Ready to Assign carries into this month",
  icon: "history",
};

function palette(theme: Theme) {
  return theme === "dark"
    ? {
        page: "bg-[#161A1D]",
        surface: "bg-[#22272B]",
        surfaceRaised: "bg-[#282E33]",
        border: "border-[#38414A]",
        text: "text-[#DEE4EA]",
        subtle: "text-[#9FADBC]",
        hover: "hover:bg-[#2C333A]",
        input: "bg-[#1D2125] border-[#38414A] text-[#DEE4EA]",
        state: {
          positive: {
            box: "bg-[#164B35]",
            fg: "text-[#7EE2B8]",
            ring: "ring-[#2ABB7F]",
          },
          zero: {
            box: "bg-[#2C333A]",
            fg: "text-[#DEE4EA]",
            ring: "ring-[#596773]",
          },
          negative: {
            box: "bg-[#5D1F1A]",
            fg: "text-[#FD9891]",
            ring: "ring-[#F15B50]",
          },
        },
        negativeAmount: "text-[#FD9891]",
        positiveAmount: "text-[#7EE2B8]",
        button: "bg-[#579DFF] text-[#1D2125] hover:bg-[#85B8FF]",
      }
    : {
        page: "bg-neutral-100",
        surface: "bg-neutral-0",
        surfaceRaised: "bg-neutral-0",
        border: "border-neutral-200",
        text: "text-neutral-800",
        subtle: "text-neutral-600",
        hover: "hover:bg-neutral-100",
        input: "bg-neutral-0 border-neutral-200 text-neutral-800",
        state: {
          positive: {
            box: "bg-[#DCFFF1]",
            fg: "text-[#216E4E]",
            ring: "ring-success",
          },
          zero: {
            box: "bg-neutral-100",
            fg: "text-neutral-800",
            ring: "ring-neutral-200",
          },
          negative: {
            box: "bg-[#FFECEB]",
            fg: "text-[#AE2E24]",
            ring: "ring-danger",
          },
        },
        negativeAmount: "text-danger",
        positiveAmount: "text-success",
        button: "bg-brand-700 text-white hover:bg-brand-800",
      };
}

export type Palette = ReturnType<typeof palette>;

/** `+₪1.00` / `−₪1.00` (true minus sign) / `₪0.00`, always LTR-isolated. */
function Signed({ amount, currency }: { amount: number; currency: string }) {
  const abs = formatMilliunits(Math.abs(amount), currency);
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return (
    <bdi dir="ltr" className="tabular-nums">
      {sign}
      {abs}
    </bdi>
  );
}

export function Money({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}) {
  return (
    <bdi dir="ltr" className="tabular-nums">
      {formatMilliunits(amount, currency)}
    </bdi>
  );
}

/** What every variant derives from its props before rendering. */
export function useHeaderModel(props: VariantProps) {
  const p = palette(props.theme);
  // Past months show 0: Ready to Assign only lives in the current and
  // future months (feedback on the preview).
  const state = props.past ? "zero" : props.state;
  return {
    p,
    s: p.state[state],
    copy: props.past ? PAST_COPY : STATE_COPY[state],
    total: props.past ? 0 : totalOf(breakdownFor(state)),
    href: useMonthHref(),
    ...monthNav(props),
  };
}

/** A prev/next month arrow, dimmed (not a link) at the end of the range. */
export function MonthArrow({
  target,
  href,
  icon,
  label,
  className,
}: {
  target: string | null;
  href: (month: string) => string;
  icon: string;
  label: string;
  className: string;
}) {
  if (!target) {
    return (
      <span
        className={`flex h-8 w-8 items-center justify-center opacity-30 ${className}`}
      >
        <Icon name={icon} />
      </span>
    );
  }
  return (
    <Link
      href={href(target)}
      scroll={false}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center ${className}`}
    >
      <Icon name={icon} />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// The breakdown's exact lines.
// ---------------------------------------------------------------------------

function BreakdownLines({
  month,
  currency,
  state,
  p,
  compact = false,
}: {
  month: string;
  currency: string;
  state: RtaState;
  p: Palette;
  compact?: boolean;
}) {
  const b = breakdownFor(state);
  const total = totalOf(b);
  const prev = monthName(shiftMonth(month, -1));
  const cur = monthName(month);
  const lines: { label: string; amount: number; note?: string }[] = [
    {
      label: `Left over from ${prev}`,
      amount: b.leftOver,
      note: `Ready to Assign at the end of ${prev}, before ${cur}'s assignments`,
    },
    { label: `Inflow: Ready to Assign in ${cur}`, amount: b.inflow },
    {
      label: `Cash overspending in ${prev}`,
      amount: b.overspent,
      note: "Categories that ended last month below zero restart at zero",
    },
    { label: `Assigned in ${cur}`, amount: b.assigned },
    { label: "Assigned in future months", amount: b.assignedFuture },
  ];
  return (
    <dl className={`${compact ? "space-y-1" : "space-y-1.5"} text-body`}>
      {lines.map((l) => (
        <div
          key={l.label}
          className="flex items-baseline justify-between gap-4"
        >
          <dt className={p.subtle} title={l.note}>
            {l.label}
          </dt>
          <dd className={`${p.text} whitespace-nowrap`}>
            <Signed amount={l.amount} currency={currency} />
          </dd>
        </div>
      ))}
      <div
        className={`flex items-baseline justify-between gap-4 border-t ${p.border} pt-1.5 font-semibold`}
      >
        <dt className={p.text}>Ready to Assign</dt>
        <dd
          className={`whitespace-nowrap ${
            total < 0 ? p.negativeAmount : total > 0 ? p.positiveAmount : p.text
          }`}
        >
          = <Money amount={total} currency={currency} />
        </dd>
      </div>
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Move money *from* Ready to Assign into a category (issue #134). Stubbed:
// shows the transferAvailable call it would make instead of making it.
// ---------------------------------------------------------------------------

function SentCall({
  call,
  p,
  onOk,
}: {
  call: string;
  p: Palette;
  onOk: () => void;
}) {
  return (
    <div className="space-y-2 text-small">
      <p className={p.text}>Prototype: this would call</p>
      <pre
        className={`overflow-x-auto rounded p-2 ${p.surfaceRaised} ${p.subtle}`}
      >
        {call}
      </pre>
      <button
        type="button"
        onClick={onOk}
        className={`rounded px-2 py-1 font-medium ${p.button}`}
      >
        OK
      </button>
    </div>
  );
}

function parseAmount(amount: string): number {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 ? numberToMilliunits(n) : 0;
}

function inputClass(p: Palette) {
  return `mt-1 w-full rounded border px-2 py-1 text-body focus:outline-none focus:ring-1 focus:ring-brand-700 ${p.input}`;
}

function CategoryPicker({
  groups,
  currency,
  value,
  onChange,
  p,
}: {
  groups: PickerGroup[];
  currency: string;
  value: string;
  onChange: (id: string) => void;
  p: Palette;
}) {
  return (
    <select
      id="rta-to"
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass(p)}
    >
      {groups
        .filter((g) => g.categories.length > 0)
        .map((g) => (
          <optgroup key={g.id} label={g.name}>
            {g.categories.map((c) => (
              // <option> can't hold <bdi>; a U+2068/U+2069 isolate pair
              // keeps a Hebrew name from swallowing the amount after it.
              <option key={c.id} value={c.id}>
                {`\u2068${c.name}\u2069 — ${formatMilliunits(c.available, currency)}`}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}

function AfterPreview({
  after,
  target,
  milli,
  currency,
  p,
}: {
  after: number;
  target: PickerGroup["categories"][number] | undefined;
  milli: number;
  currency: string;
  p: Palette;
}) {
  const negative = after < 0;
  return (
    <div className={`rounded px-2 py-1.5 text-small ${p.surfaceRaised}`}>
      <div className="flex justify-between gap-2">
        <span className={p.subtle}>Ready to Assign after</span>
        <span
          className={`font-semibold ${negative ? p.negativeAmount : p.text}`}
        >
          <Money amount={after} currency={currency} />
        </span>
      </div>
      {target && (
        <div className="flex justify-between gap-2">
          <span className={`truncate ${p.subtle}`}>
            <bdi>{target.name}</bdi> after
          </span>
          <span className={p.text}>
            <Money amount={target.available + milli} currency={currency} />
          </span>
        </div>
      )}
      {negative && (
        <p className={`mt-1 ${p.negativeAmount}`}>
          This assigns more than you have. You can still do it.
        </p>
      )}
    </div>
  );
}

function FormButtons({
  onCancel,
  disabled,
  p,
}: {
  onCancel?: () => void;
  disabled: boolean;
  p: Palette;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className={`rounded px-2 py-1 text-small ${p.subtle} ${p.hover}`}
        >
          Cancel
        </button>
      )}
      <button
        type="submit"
        disabled={disabled}
        className={`rounded px-2 py-1 text-small font-medium disabled:opacity-50 ${p.button}`}
      >
        Assign
      </button>
    </div>
  );
}

function transferCall(to: string, milli: number, month: string) {
  return `transferAvailable({\n  fromCategoryId: "READY_TO_ASSIGN",\n  toCategoryId: "${to}",\n  amount: ${milli},\n  month: "${month}",\n})`;
}

/** Prefill with all of Ready to Assign when there's any. */
function initialAmount(total: number): string {
  return total > 0 ? (total / 1000).toFixed(2) : "";
}

function firstId(categories: { id: string }[]): string {
  return categories.length > 0 ? categories[0].id : "";
}

export function AssignFromRtaForm({
  month,
  currency,
  state,
  groups,
  p,
  onDone,
  autoFocus = true,
}: {
  month: string;
  currency: string;
  state: RtaState;
  groups: PickerGroup[];
  p: Palette;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const total = totalOf(breakdownFor(state));
  const [amount, setAmount] = useState(initialAmount(total));
  const categories = groups.flatMap((g) => g.categories);
  const [to, setTo] = useState(firstId(categories));
  const [sent, setSent] = useState<string | null>(null);

  const milli = parseAmount(amount);

  if (sent) {
    return (
      <SentCall
        call={sent}
        p={p}
        onOk={() => {
          setSent(null);
          onDone?.();
        }}
      />
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(transferCall(to, milli, month));
      }}
    >
      <div>
        <label className={`block text-small ${p.subtle}`} htmlFor="rta-amount">
          Assign
        </label>
        <input
          id="rta-amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          autoFocus={autoFocus}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`${inputClass(p)} no-spinner text-right tabular-nums`}
        />
      </div>
      <div>
        <label className={`block text-small ${p.subtle}`} htmlFor="rta-to">
          To
        </label>
        <CategoryPicker
          groups={groups}
          currency={currency}
          value={to}
          onChange={setTo}
          p={p}
        />
      </div>
      <AfterPreview
        after={total - milli}
        target={categories.find((c) => c.id === to)}
        milli={milli}
        currency={currency}
        p={p}
      />
      <FormButtons onCancel={onDone} disabled={!to || milli === 0} p={p} />
    </form>
  );
}

/** Stands in for the breakdown and the Assign form in a past month. */
function PastNote(props: VariantProps & { p: Palette }) {
  const { currentMonth, p } = props;
  const href = useMonthHref();
  return (
    <p className={`text-body ${p.subtle}`}>
      Ready to Assign is 0 in past months. It lives in the current month and
      later.{" "}
      <Link
        href={href(currentMonth)}
        scroll={false}
        className="text-brand-700 underline"
      >
        Go to {monthLabel(currentMonth)}
      </Link>
    </p>
  );
}

/** The breakdown, or the past-month note. */
export function MonthBreakdown(
  props: VariantProps & { p: Palette; compact?: boolean },
) {
  if (props.past) return <PastNote {...props} />;
  return <BreakdownLines {...props} />;
}

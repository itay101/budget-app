"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";
import { AvailableOptions } from "@/components/AvailableOptions";
import { formatMilliunits, milliunitsToNumber, numberToMilliunits } from "@/lib/money";
import {
  READY_TO_ASSIGN,
  type ReadyToAssignBreakdown,
  type ReadyToAssignState,
} from "@/lib/readyToAssign";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

/**
 * Each Ready to Assign state's copy and colours (#136, variant B). Every
 * state has an icon and a label, so colour is never the only signal. The
 * green and red reuse the Funded and Overspent tokens, which are the same
 * fills #136 settled on. Class names are spelled out in full so Tailwind
 * finds them.
 */
const READY_TO_ASSIGN_STYLE: Record<
  ReadyToAssignState,
  { label: string; hint: string; icon: string; fill: string }
> = {
  positive: {
    label: "Ready to Assign",
    hint: "Give it a job before you spend it",
    icon: "savings",
    fill: "bg-target-funded-bg text-target-funded-fg",
  },
  zero: {
    label: "All Money Assigned",
    hint: "Every bit of income has a job",
    icon: "check_circle",
    fill: "bg-neutral-100 text-neutral-800",
  },
  negative: {
    label: "You assigned more than you have",
    hint: "Move money back to Ready to Assign to fix this",
    icon: "error",
    fill: "bg-target-overspent-bg text-target-overspent-fg",
  },
};

/** An amount that never reorders next to right-to-left text. */
function Amount({ milliunits, currency }: { milliunits: number; currency: string }) {
  return <bdi dir="ltr">{formatMilliunits(milliunits, currency)}</bdi>;
}

/** One signed Breakdown line. `amount` is the line's size; `sign` is its
 * role in the sum, shown with a true minus sign. */
function BreakdownLine({
  label,
  sign,
  amount,
  currency,
}: {
  label: string;
  sign: "+" | "−";
  amount: number;
  currency: string;
}) {
  // A negative left-over is already "minus" money: show it as − |x|.
  const shownSign = amount < 0 ? (sign === "+" ? "−" : "+") : sign;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-body text-neutral-600">{label}</dt>
      <dd className="whitespace-nowrap text-body tabular-nums text-neutral-800">
        {shownSign}
        <Amount milliunits={Math.abs(amount)} currency={currency} />
      </dd>
    </div>
  );
}

/**
 * The Ready to Assign pill in the budget page's sticky month toolbar, and
 * the drawer it opens (#121, design from #136): a right-hand panel from
 * `md` up and a bottom sheet on phones. The drawer shows the month's
 * figure, its state and the Breakdown, whose lines add up to the total
 * (ADR 0009). An earlier month shows its own figure, so it has no
 * "Assigned in future months" line.
 *
 * Below the Breakdown, Assign money moves money from Ready to Assign into
 * a category (#217, #136). The Month summary (#181) and the next-month
 * warning (#183) aren't part of this yet.
 */
export function ReadyToAssignPill({
  breakdown,
  currency,
  month,
  monthName,
  previousMonthName,
  isPast,
  categoryOptions,
  transferAvailable,
}: {
  breakdown: ReadyToAssignBreakdown;
  currency: string;
  /** The viewed Budget Month, `YYYY-MM`. */
  month: string;
  /** Every category money can be assigned to, grouped, with its Available. */
  categoryOptions: GroupOption[];
  transferAvailable: (formData: FormData) => Promise<void>;
  /** The viewed month, e.g. "November 2026". */
  monthName: string;
  /** The month before it, e.g. "October 2026". */
  previousMonthName: string;
  /** Whether the viewed month is before the current one. */
  isPast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const style = READY_TO_ASSIGN_STYLE[breakdown.state];

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const trigger = triggerRef.current;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-full px-3 py-1 text-body font-semibold ${style.fill}`}
      >
        <Icon name={style.icon} />
        <span className="tabular-nums">
          <Amount milliunits={breakdown.total} currency={currency} />
        </span>
        <span className="hidden font-normal md:inline">{style.label}</span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-neutral-800/30"
              aria-hidden="true"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ready-to-assign-title"
              className="absolute inset-x-0 bottom-0 max-h-sheet overflow-y-auto rounded-t-lg border border-neutral-200 bg-neutral-0 p-300 shadow-lg md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-96 md:rounded-none md:rounded-l-lg"
            >
              <div className="mb-200 flex items-center justify-between">
                <h2 id="ready-to-assign-title" className="text-h3 text-neutral-800">
                  {monthName}
                </h2>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-sm p-1 text-neutral-600 hover:bg-neutral-100"
                >
                  <Icon name="close" label="Close" />
                </button>
              </div>

              <div className={`rounded-lg p-200 ${style.fill}`}>
                <div className="flex items-center gap-1 text-small font-medium">
                  <Icon name={style.icon} />
                  {style.label}
                </div>
                <div className="text-display tabular-nums">
                  <Amount milliunits={breakdown.total} currency={currency} />
                </div>
                <p className="text-small">{style.hint}</p>
              </div>

              <h3 className="mb-1 mt-300 text-small font-medium uppercase tracking-wide text-neutral-600">
                Breakdown
              </h3>
              <dl>
                <BreakdownLine
                  label={`Left over from ${previousMonthName}`}
                  sign="+"
                  amount={breakdown.leftOver}
                  currency={currency}
                />
                <BreakdownLine
                  label={`Inflow: Ready to Assign in ${monthName}`}
                  sign="+"
                  amount={breakdown.inflow}
                  currency={currency}
                />
                <BreakdownLine
                  label={`Cash overspending in ${previousMonthName}`}
                  sign="−"
                  amount={breakdown.overspent}
                  currency={currency}
                />
                <BreakdownLine
                  label={`Assigned in ${monthName}`}
                  sign="−"
                  amount={breakdown.assigned}
                  currency={currency}
                />
                {!isPast && (
                  <BreakdownLine
                    label="Assigned in future months"
                    sign="−"
                    amount={breakdown.assignedFuture}
                    currency={currency}
                  />
                )}
                <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-neutral-200 pt-2">
                  <dt className="text-body font-semibold text-neutral-800">Ready to Assign</dt>
                  <dd
                    className={`whitespace-nowrap rounded-sm px-1 text-body font-semibold tabular-nums ${style.fill}`}
                  >
                    =<Amount milliunits={breakdown.total} currency={currency} />
                  </dd>
                </div>
              </dl>

              <AssignMoneyForm
                total={breakdown.total}
                currency={currency}
                month={month}
                groups={categoryOptions}
                transferAvailable={transferAvailable}
                onDone={() => setOpen(false)}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * The drawer's Assign money form (#136): an amount, prefilled with all of
 * Ready to Assign when it's positive, and a category, with a preview of
 * both figures afterwards. Assigning more than there is turns the preview
 * red but stays allowed (#134). All arithmetic is in milliunits.
 */
function AssignMoneyForm({
  total,
  currency,
  month,
  groups,
  transferAvailable,
  onDone,
}: {
  total: number;
  currency: string;
  month: string;
  groups: GroupOption[];
  transferAvailable: (formData: FormData) => Promise<void>;
  onDone: () => void;
}) {
  const categories = groups.flatMap((group) => group.categories);
  const [amountInput, setAmountInput] = useState(() => prefillAmount(total));
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  if (categories.length === 0) return null;

  const amount = Math.max(0, numberToMilliunits(Number(amountInput) || 0));
  const category = categories.find((c) => c.id === categoryId) ?? categories[0];
  const readyAfter = total - amount;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await transferAvailable(formData);
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-300 space-y-2" aria-label="Assign money">
      <h3 className="text-small font-medium uppercase tracking-wide text-neutral-600">
        Assign money
      </h3>
      <input type="hidden" name="fromCategoryId" value={READY_TO_ASSIGN} />
      <input type="hidden" name="month" value={month} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-small text-neutral-600" htmlFor="assign-amount">
            Amount
          </label>
          <MoneyInput
            id="assign-amount"
            name="amount"
            currency={currency}
            min="0.01"
            required
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="mt-1 w-full rounded-sm border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-hidden focus:ring-1 focus:ring-brand-700"
          />
        </div>
        <div>
          <label className="block text-small text-neutral-600" htmlFor="assign-to">
            To
          </label>
          <select
            id="assign-to"
            name="toCategoryId"
            required
            value={category.id}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 w-full rounded-sm border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-hidden focus:ring-1 focus:ring-brand-700"
          >
            <AvailableOptions groups={groups} currency={currency} />
          </select>
        </div>
      </div>

      <AssignPreview
        readyAfter={readyAfter}
        categoryName={category.name}
        categoryAfter={category.available + amount}
        currency={currency}
      />
      <AssignButton pending={pending} disabled={amount <= 0} />
    </form>
  );
}

/** What Ready to Assign and the chosen category will be after assigning.
 * Not a <dl>: the drawer's only description list is the Breakdown. */
function AssignPreview({
  readyAfter,
  categoryName,
  categoryAfter,
  currency,
}: {
  readyAfter: number;
  categoryName: string;
  categoryAfter: number;
  currency: string;
}) {
  const overAssigned = readyAfter < 0;
  const readyClass = overAssigned ? "font-semibold text-target-overspent-fg" : "text-neutral-800";
  return (
    <>
      <div aria-label="After assigning" className="rounded-sm bg-neutral-100 px-2 py-1 text-small">
        <p className="flex justify-between gap-2">
          <span className="text-neutral-600">Ready to Assign after</span>
          <span className={`tabular-nums ${readyClass}`}>
            <Amount milliunits={readyAfter} currency={currency} />
          </span>
        </p>
        <p className="flex justify-between gap-2">
          <span className="text-neutral-600">
            <bdi>{categoryName}</bdi> after
          </span>
          <span className="tabular-nums text-neutral-800">
            <Amount milliunits={categoryAfter} currency={currency} />
          </span>
        </p>
      </div>
      {overAssigned && (
        <p role="status" className="text-small text-target-overspent-fg">
          This assigns more than you have. You can still do it.
        </p>
      )}
    </>
  );
}

/** The amount Assign money starts with: all of Ready to Assign when it's
 * positive, otherwise empty. */
function prefillAmount(total: number): string {
  return total > 0 ? String(milliunitsToNumber(total)) : "";
}

function AssignButton({ pending, disabled }: { pending: boolean; disabled: boolean }) {
  return (
    <div className="flex justify-end">
      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded-sm bg-brand-700 px-3 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
      >
        {pending ? "Assigning…" : "Assign"}
      </button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { formatMilliunits } from "@/lib/money";
import {
  addsMoney,
  AUTO_ASSIGN_LABELS,
  AUTO_ASSIGN_OPTIONS,
  planRun,
  type AutoAssignCategory,
  type AutoAssignOption,
  type AutoAssignPlan,
} from "@/lib/autoAssign";

export type AutoAssignAction = (formData: FormData) => Promise<{
  applied: { categoryId: string; from: number; to: number }[];
  skipped: string[];
}>;

/** What a confirmed run hands back, for its toast and Undo. */
export interface AutoAssignDone {
  option: AutoAssignOption;
  month: string;
  applied: { categoryId: string; from: number; to: number }[];
  skipped: number;
  total: number;
}

function Amount({ milliunits, currency }: { milliunits: number; currency: string }) {
  return <bdi dir="ltr">{formatMilliunits(milliunits, currency)}</bdi>;
}

/** Why an option can't run now, or null when it can. */
function disabledReason(option: AutoAssignOption, plan: AutoAssignPlan, readyToAssign: number, isPast: boolean) {
  if (plan.rows.length === 0) return "Nothing to change";
  if (addsMoney(option) && plan.total > 0) {
    if (readyToAssign <= 0) return "No money to assign";
    if (isPast) return "Not in past months yet";
  }
  return null;
}

/**
 * The Auto-Assign menu (#147): each option with what it would assign, a
 * read-only preview of every change, then Confirm. The preview comes from
 * planRun over the categories in scope; the server applies each row only if
 * it hasn't changed since (see the `autoAssign` action).
 */
export function AutoAssignMenu({
  categories,
  readyToAssign,
  month,
  currency,
  isPast,
  autoAssign,
  onDone,
}: {
  /** The categories in scope, in display order. */
  categories: AutoAssignCategory[];
  readyToAssign: number;
  /** The viewed Budget Month, `YYYY-MM`. */
  month: string;
  currency: string;
  isPast: boolean;
  autoAssign: AutoAssignAction;
  onDone: (done: AutoAssignDone) => void;
}) {
  const [previewing, setPreviewing] = useState<AutoAssignOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const plans = new Map(AUTO_ASSIGN_OPTIONS.map((option) => [option, planRun(option, categories, readyToAssign)]));

  if (previewing) {
    const plan = plans.get(previewing)!;
    const confirm = () =>
      startTransition(async () => {
        const formData = new FormData();
        formData.set("option", previewing);
        formData.set("month", month);
        formData.set("rows", JSON.stringify(plan.rows.map(({ categoryId, from, to }) => ({ categoryId, from, to }))));
        try {
          const result = await autoAssign(formData);
          const total = result.applied.reduce((sum, row) => sum + row.to - row.from, 0);
          onDone({ option: previewing, month, applied: result.applied, skipped: result.skipped.length, total });
          setPreviewing(null);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Auto-Assign failed");
        }
      });
    return (
      <section aria-label={`Auto-Assign ${AUTO_ASSIGN_LABELS[previewing]} preview`} className="space-y-2">
        <h3 className="text-small font-medium uppercase tracking-wide text-neutral-600">
          Auto-Assign: {AUTO_ASSIGN_LABELS[previewing]}
        </h3>
        <ul className="max-h-64 divide-y divide-neutral-200 overflow-y-auto rounded-sm border border-neutral-200 text-small">
          {plan.rows.map((row) => (
            <li key={row.categoryId} className="flex items-baseline justify-between gap-2 px-2 py-1">
              <span className="min-w-0 truncate text-neutral-800">
                <bdi>{row.name}</bdi>
                {row.hidden && <span className="text-neutral-600"> (hidden)</span>}
                {row.partial && <span className="text-target-underfunded-fg"> · partly funded</span>}
              </span>
              <span className="whitespace-nowrap tabular-nums text-neutral-600">
                <Amount milliunits={row.from} currency={currency} /> →{" "}
                <span className="text-neutral-800">
                  <Amount milliunits={row.to} currency={currency} />
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between text-small font-semibold text-neutral-800">
          <span>Total</span>
          <Amount milliunits={plan.total} currency={currency} />
        </p>
        {error && (
          <p role="alert" className="text-small text-target-overspent-fg">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setPreviewing(null);
              setError(null);
            }}
            className="rounded-sm px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={confirm}
            className="rounded-sm bg-brand-700 px-3 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {pending ? "Assigning…" : "Confirm"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Auto-Assign" className="space-y-1">
      <h3 className="text-small font-medium uppercase tracking-wide text-neutral-600">Auto-Assign</h3>
      {AUTO_ASSIGN_OPTIONS.map((option) => {
        const plan = plans.get(option)!;
        const reason = disabledReason(option, plan, readyToAssign, isPast);
        return (
          <button
            key={option}
            type="button"
            disabled={reason !== null}
            title={reason ?? undefined}
            onClick={() => setPreviewing(option)}
            className="flex w-full items-baseline justify-between gap-2 rounded-sm px-2 py-1 text-left text-body text-neutral-800 hover:bg-neutral-100 disabled:cursor-default disabled:text-neutral-600 disabled:hover:bg-transparent"
          >
            <span>{AUTO_ASSIGN_LABELS[option]}</span>
            <span className="tabular-nums">
              {reason ?? <Amount milliunits={plan.total} currency={currency} />}
            </span>
          </button>
        );
      })}
    </section>
  );
}

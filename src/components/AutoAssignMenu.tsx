"use client";

import { useState, useTransition } from "react";
import { Toast } from "@/components/Toast";
import type { AutoAssignAction } from "@/components/ReadyToAssignContext";
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

/** Why an option can't run now, or null when it can. With no money to add,
 * planRun funds no increases, so an option that adds money is off only when
 * it has nothing else to do; one whose run also frees money still runs (#147). */
function disabledReason(option: AutoAssignOption, plan: AutoAssignPlan, limit: number) {
  if (plan.rows.length > 0) return null;
  return addsMoney(option) && limit <= 0 ? "No money to assign" : "Nothing to change";
}

/**
 * The Auto-Assign menu (#147): each option with what it would assign, a
 * read-only preview of every change, then Confirm. The preview comes from
 * planRun over the categories in scope; the server applies each row only if
 * it hasn't changed since (see the `autoAssign` action).
 */
export function AutoAssignMenu({
  categories,
  limit,
  month,
  currency,
  autoAssign,
  onDone,
}: {
  /** The categories in scope, in display order. */
  categories: AutoAssignCategory[];
  /** The most a run may add (getBudgetMonthRows' autoAssignLimit). */
  limit: number;
  /** The viewed Budget Month, `YYYY-MM`. */
  month: string;
  currency: string;
  autoAssign: AutoAssignAction;
  onDone: (done: AutoAssignDone) => void;
}) {
  const [previewing, setPreviewing] = useState<AutoAssignOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const plans = new Map(AUTO_ASSIGN_OPTIONS.map((option) => [option, planRun(option, categories, limit)]));

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
        const reason = disabledReason(option, plan, limit);
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

/**
 * The toast after an Auto-Assign run, with Undo for as long as the page
 * stays open (#219), then a short note on how the Undo went.
 */
export function AutoAssignToasts({
  run,
  currency,
  undoAutoAssign,
  onRunClosed,
}: {
  run: AutoAssignDone | null;
  currency: string;
  undoAutoAssign: AutoAssignAction;
  onRunClosed: () => void;
}) {
  const [undoNote, setUndoNote] = useState<string | null>(null);

  async function undo(done: AutoAssignDone) {
    onRunClosed();
    const formData = new FormData();
    formData.set("option", done.option);
    formData.set("month", done.month);
    formData.set("rows", JSON.stringify(done.applied));
    try {
      const result = await undoAutoAssign(formData);
      setUndoNote(undoMessage(result.applied.length, result.skipped.length));
    } catch (e) {
      setUndoNote(`Undo failed: ${e instanceof Error ? e.message : "please try again"}`);
    }
  }

  return (
    <>
      {run && (
        <Toast
          message={autoAssignMessage(run, currency)}
          actionLabel={run.applied.length > 0 ? "Undo" : undefined}
          onAction={() => void undo(run)}
          onClose={onRunClosed}
        />
      )}
      {undoNote && <Toast message={undoNote} onClose={() => setUndoNote(null)} />}
    </>
  );
}

/** The note after an Undo, e.g. "Undid 3 changes" or, when some had been
 * edited since the run, how many were left as they were. */
export function undoMessage(undone: number, skipped: number): string {
  const done = `Undid ${undone} ${undone === 1 ? "change" : "changes"}`;
  return skipped > 0 ? `${done}; ${skipped} changed since and left as is` : done;
}

/** The toast after an Auto-Assign run, e.g. "Assigned $40.00 to 3
 * categories" (#147), noting any rows that had changed and were skipped. */
export function autoAssignMessage(run: AutoAssignDone, currency: string): string {
  const count = run.applied.length;
  const categories = `${count} ${count === 1 ? "category" : "categories"}`;
  const amount = formatMilliunits(Math.abs(run.total), currency);
  const done = run.total >= 0 ? `Assigned ${amount} to ${categories}` : `Freed ${amount} from ${categories}`;
  return run.skipped > 0 ? `${done} (${run.skipped} changed since the preview, skipped)` : done;
}

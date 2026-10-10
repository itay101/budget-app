"use client";

import { useState } from "react";
import { addMonths, formatBudgetMonth, monthLabel, parseBudgetMonth } from "@/lib/budgetMonth";
import { formatMilliunitsLtr } from "@/lib/money";
import {
  WEEKDAY_NAMES,
  describeTarget,
  dueLabel,
  historyRanges,
  targetAsOf,
  targetProgress,
  type TargetHistoryEntry,
  type TargetRowNumbers,
} from "@/lib/targetDisplay";
import { EDITOR_KINDS, draftFrom, isRecurring, targetFields, type TargetDraft } from "@/lib/targetForm";
import type { TargetCadence } from "@/lib/targets";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";
import { useServerAction } from "@/components/useServerAction";

type Action = (formData: FormData) => Promise<void>;
type Fmt = (milliunits: number) => string;

/** The four target actions (#170), handed down from the budget page. */
export type TargetActions = {
  setTarget: Action;
  removeTarget: Action;
  snoozeTarget: Action;
  unsnoozeTarget: Action;
};

const fieldClass =
  "w-full rounded border border-neutral-200 bg-neutral-0 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700";
const labelClass = "mb-0.5 block text-small text-neutral-600";

/**
 * A category's target editor (#171), expanded in place under its budget
 * row: the kind, amount and schedule, a note on which months the change
 * applies to (ADR 0011's effective-from rows), Snooze/Remove, and the
 * target's history and this month's numbers beside the form.
 */
export function TargetEditor({
  categoryId,
  row,
  history,
  snoozed,
  month: monthKey,
  currency,
  actions,
  onDone,
}: {
  categoryId: string;
  row: TargetRowNumbers;
  history: TargetHistoryEntry[];
  snoozed: boolean;
  /** The viewed Budget Month, `YYYY-MM`. */
  month: string;
  currency: string;
  actions: TargetActions;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(row.target));
  const save = useServerAction(actions.setTarget);
  const remove = useServerAction(actions.removeTarget);
  const snooze = useServerAction(snoozed ? actions.unsnoozeTarget : actions.snoozeTarget);
  const pending = save.pending || remove.pending || snooze.pending;
  const error = save.error || remove.error || snooze.error;

  const month = parseBudgetMonth(monthKey) ?? new Date();
  const fmt: Fmt = (milliunits) => formatMilliunitsLtr(milliunits, currency);

  async function run(action: typeof save, fields: Record<string, string | undefined> = {}) {
    try {
      await action.run({ categoryId, month: monthKey, ...fields });
      onDone();
    } catch {
      // error is surfaced via the action's error
    }
  }

  return (
    <div className="grid gap-200 border-b border-neutral-100 bg-neutral-100 px-200 py-200 md:grid-cols-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(save, targetFields(draft));
        }}
        className="space-y-2 text-body"
        aria-label="Target"
      >
        <KindPicker draft={draft} onChange={setDraft} />
        <ScheduleFields draft={draft} currency={currency} onChange={setDraft} />
        <EffectiveFromNote history={history} month={month} fmt={fmt} />
        {error && <p className="rounded bg-danger/10 px-2 py-1 text-small text-danger">{error}</p>}
        <EditorButtons
          hasTarget={row.target !== null}
          snoozed={snoozed}
          month={month}
          pending={pending}
          onSnooze={() => void run(snooze)}
          onRemove={() => void run(remove)}
          onCancel={onDone}
        />
      </form>

      <TargetHistory history={history} row={row} month={month} fmt={fmt} />
    </div>
  );
}

/** Save, Snooze/Unsnooze, Cancel and Remove. Snooze and Remove only
 * show once there's a target. */
function EditorButtons({
  hasTarget,
  snoozed,
  month,
  pending,
  onSnooze,
  onRemove,
  onCancel,
}: {
  hasTarget: boolean;
  snoozed: boolean;
  month: Date;
  pending: boolean;
  onSnooze: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const monthName = month.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand-700 px-3 py-1 text-body font-medium text-neutral-0 hover:bg-brand-800 disabled:opacity-50"
      >
        Save target
      </button>
      {hasTarget && (
        <button
          type="button"
          disabled={pending}
          onClick={onSnooze}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-body text-target-snoozed-fg hover:bg-target-snoozed-bg disabled:opacity-50"
        >
          <Icon name="snooze" />
          {snoozed ? "Unsnooze" : `Snooze for ${monthName}`}
        </button>
      )}
      <button type="button" onClick={onCancel} className="rounded px-2 py-1 text-body text-neutral-600 hover:bg-neutral-200">
        Cancel
      </button>
      {hasTarget && (
        <button
          type="button"
          disabled={pending}
          onClick={onRemove}
          className="ms-auto inline-flex items-center gap-1 rounded px-2 py-1 text-body text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          <Icon name="delete" /> Remove
        </button>
      )}
    </div>
  );
}

type DraftProps = { draft: TargetDraft; onChange: (update: (draft: TargetDraft) => TargetDraft) => void };

function KindPicker({ draft, onChange }: DraftProps) {
  return (
    <div role="group" aria-label="Target type" className="flex flex-wrap gap-1">
      {EDITOR_KINDS.map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          aria-pressed={draft.kind === kind}
          onClick={() => onChange((d) => ({ ...d, kind }))}
          className={
            "rounded border bg-neutral-0 px-2 py-1 text-small " +
            (draft.kind === kind
              ? "border-brand-700 font-semibold text-brand-700"
              : "border-neutral-200 text-neutral-600 hover:border-neutral-600")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Amount, plus the schedule fields the kind and cadence use. */
function ScheduleFields({ draft, currency, onChange }: DraftProps & { currency: string }) {
  const set = (patch: Partial<TargetDraft>) => onChange((d) => ({ ...d, ...patch }));
  const recurring = isRecurring(draft);
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
      <label className="block">
        <span className={labelClass}>Amount</span>
        <MoneyInput
          currency={currency}
          min="0.01"
          required
          value={draft.amount}
          onChange={(e) => set({ amount: e.target.value })}
          className={fieldClass}
        />
      </label>
      {recurring && (
        <label className="block">
          <span className={labelClass}>Repeats</span>
          <select value={draft.cadence} onChange={(e) => set({ cadence: e.target.value as TargetCadence })} className={fieldClass}>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </label>
      )}
      {recurring && <CadenceField draft={draft} set={set} />}
      {draft.kind === "BALANCE_DATED" && (
        <label className="block">
          <span className={labelClass}>By month</span>
          <input type="month" required value={draft.dueMonth} onChange={(e) => set({ dueMonth: e.target.value })} className={fieldClass} />
        </label>
      )}
    </div>
  );
}

/** Weekday, due day or due date, by cadence. */
function CadenceField({ draft, set }: { draft: TargetDraft; set: (patch: Partial<TargetDraft>) => void }) {
  switch (draft.cadence) {
    case "WEEKLY":
      return (
        <label className="block">
          <span className={labelClass}>Every</span>
          <select value={draft.weekday} onChange={(e) => set({ weekday: e.target.value })} className={fieldClass}>
            {WEEKDAY_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
      );
    case "YEARLY":
      return (
        <label className="block">
          <span className={labelClass}>Due date</span>
          <input type="date" required value={draft.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className={fieldClass} />
        </label>
      );
    default:
      return (
        <label className="block">
          <span className={labelClass}>Due day (optional)</span>
          <input
            type="number"
            min={1}
            max={31}
            inputMode="numeric"
            value={draft.dueDay}
            onChange={(e) => set({ dueDay: e.target.value })}
            placeholder="e.g. 15"
            className={fieldClass}
          />
        </label>
      );
  }
}

/** "Applies from October 2026 onwards. September 2026 and earlier keep: …" */
function EffectiveFromNote({ history, month, fmt }: { history: TargetHistoryEntry[]; month: Date; fmt: Fmt }) {
  const previous = addMonths(month, -1);
  const earlier = targetAsOf(history, formatBudgetMonth(previous));
  const replacesThisMonth = history.some((entry) => entry.startMonth === formatBudgetMonth(month));
  return (
    <div className="flex gap-2 rounded border-s-4 border-brand-700 bg-neutral-0 px-2 py-1.5 text-small text-neutral-600">
      <Icon name="event_upcoming" />
      <div>
        <div className="text-neutral-800">
          Applies from <strong>{monthLabel(month)}</strong> onwards.
        </div>
        <div>
          <bdi>
            {earlier
              ? `${monthLabel(previous)} and earlier keep: ${describeTarget(earlier, fmt)}.`
              : `${monthLabel(previous)} and earlier had no target, and stay that way.`}
          </bdi>
          {replacesThisMonth && " This replaces the change already made for this month."}
        </div>
      </div>
    </div>
  );
}

function TargetHistory({
  history,
  row,
  month,
  fmt,
}: {
  history: TargetHistoryEntry[];
  row: TargetRowNumbers;
  month: Date;
  fmt: Fmt;
}) {
  return (
    <div className="space-y-2 text-small text-neutral-600">
      <h3 className="font-semibold text-neutral-800">Target history</h3>
      {history.length === 0 ? (
        <p>Never had a target.</p>
      ) : (
        <ol className="space-y-1">
          {historyRanges(history).map((entry) => (
            <li key={entry.startMonth}>
              <strong className="text-neutral-800">{entry.range}:</strong> <bdi>{describeTarget(entry.target, fmt)}</bdi>
            </li>
          ))}
        </ol>
      )}
      <ThisMonth row={row} month={month} fmt={fmt} />
    </div>
  );
}

/** This month's numbers: needed, funded so far, due, whole target. */
function ThisMonth({ row, month, fmt }: { row: TargetRowNumbers; month: Date; fmt: Fmt }) {
  if (!row.target || !row.need) return null;
  const progress = targetProgress(row, month);
  const lines: [string, string][] = [
    ["Needed", fmt(row.need.needed)],
    ...(progress && progress.of > 0 ? [["Funded so far", `${fmt(progress.have)} of ${fmt(progress.of)}`] as [string, string]] : []),
    ["Due", dueLabel(row.target, month)],
    ...(row.need.goal ? [["Whole target", `${fmt(row.need.goal.have)} of ${fmt(row.need.goal.amount)}`] as [string, string]] : []),
  ];
  return (
    <div className="pt-1">
      <h3 className="font-semibold text-neutral-800">This month</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2">
        {lines.map(([term, value]) => (
          <div key={term} className="contents">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

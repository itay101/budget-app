"use client";

// PROTOTYPE (issue #148), throwaway. Pieces the three variants share: the
// light/dark palette (scoped to the prototype, since the app has no dark
// mode yet), the status chip and bar, the target editor form, and an
// in-memory store standing in for the target/snooze actions.

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatMilliunits, milliunitsToNumber, numberToMilliunits } from "@/lib/money";
import { Icon } from "@/components/Icon";
import {
  type Cadence,
  type ProtoCategory,
  type Status,
  type Target,
  type TargetKind,
  STATUS_ICON,
  STATUS_LABEL,
  WEEKDAY_NAMES,
  describeTarget,
  evaluate,
  monthLabel,
  planTotals,
  previousMonthKey,
} from "./model";

// Palette tokens: light values are design.md's Atlassian colours; dark
// values are Atlassian's dark-theme equivalents. Each status has a solid
// (bar fill / icon), a soft background and a text colour that passes 4.5:1
// on that background.
export const PROTO_CSS = `
.proto-root {
  --p-surface: #FFFFFF; --p-surface-2: #F7F8F9; --p-border: #DCDFE4; --p-track: #EBECF0;
  --p-text: #172B4D; --p-text-2: #44546F; --p-brand: #1868DB;
  --p-funded: #22A06B; --p-funded-bg: #DCFFF1; --p-funded-fg: #216E4E;
  --p-track-ok: #1D7F8C; --p-track-ok-bg: #E7F9FF; --p-track-ok-fg: #206A83;
  --p-under: #B38600; --p-under-bg: #FFF7D6; --p-under-fg: #7F5F01;
  --p-cash: #CA3521; --p-cash-bg: #FFECEB; --p-cash-fg: #AE2E24;
  --p-credit: #E06C00; --p-credit-bg: #FFF3EB; --p-credit-fg: #A54800;
  --p-snooze: #6E5DC6; --p-snooze-bg: #F3F0FF; --p-snooze-fg: #5E4DB2;
  --p-none: #8590A2; --p-none-bg: #F1F2F4; --p-none-fg: #44546F;
  color: var(--p-text);
}
.proto-root[data-theme="dark"] {
  --p-surface: #22272B; --p-surface-2: #1D2125; --p-border: #38414A; --p-track: #2C333A;
  --p-text: #DEE4EA; --p-text-2: #9FADBC; --p-brand: #579DFF;
  --p-funded: #4BCE97; --p-funded-bg: #164B35; --p-funded-fg: #7EE2B8;
  --p-track-ok: #60C6D2; --p-track-ok-bg: #1D474C; --p-track-ok-fg: #9DD9EE;
  --p-under: #F5CD47; --p-under-bg: #533F04; --p-under-fg: #F8E6A0;
  --p-cash: #F87168; --p-cash-bg: #5D1F1A; --p-cash-fg: #FFD5D2;
  --p-credit: #FEA362; --p-credit-bg: #5F3811; --p-credit-fg: #FEDEC8;
  --p-snooze: #9F8FEF; --p-snooze-bg: #352C63; --p-snooze-fg: #DFD8FD;
  --p-none: #738496; --p-none-bg: #2C333A; --p-none-fg: #B6C2CF;
  background: var(--p-surface-2);
}
`;

const TONE: Record<Status, string> = {
  funded: "funded",
  on_track: "track-ok",
  underfunded: "under",
  overspent_cash: "cash",
  overspent_credit: "credit",
  snoozed: "snooze",
  none: "none",
};

export function tone(status: Status) {
  const t = TONE[status];
  return {
    solid: `var(--p-${t})`,
    bg: `var(--p-${t}-bg)`,
    fg: `var(--p-${t}-fg)`,
  };
}

export function StatusChip({
  status,
  compact = false,
  children,
}: {
  status: Status;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const c = tone(status);
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-small font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      <Icon name={STATUS_ICON[status]} />
      {!compact && <span className="truncate">{children ?? STATUS_LABEL[status]}</span>}
    </span>
  );
}

export type Overspend = { covered: number; spent: number; excessLabel: string };

// For an overspent category: what was covered (carry-in + assigned), what
// was spent, and the excess as "+₪150 · 125%".
export function overspendOf(c: ProtoCategory, fmt: (n: number) => string): Overspend | undefined {
  if (c.available >= 0) return undefined;
  const covered = Math.max(0, c.carryIn + c.assigned);
  const spent = covered - c.available;
  const pct = covered > 0 ? ` · ${Math.round((spent / covered) * 100)}%` : "";
  return { covered, spent, excessLabel: `+${fmt(-c.available)}${pct}` };
}

/**
 * How an overspent bar shows the excess past 100%, picked with the
 * prototype's `over` toggle (#148 preview feedback):
 * - dashed: the bar is scaled to what was spent; a tick marks 100% and the
 *   excess after it is a dashed, hatched segment.
 * - solid: same scale and tick, the excess is a solid, darker segment.
 * - label: the bar stays full; the excess shows only in the caption.
 * Every variant's caption prints the excess ("+₪150 · 125%") either way.
 */
export function ProgressBar({
  status,
  progress,
  height = 4,
  striped = false,
  overspend,
}: {
  status: Status;
  progress: number;
  height?: number;
  striped?: boolean;
  overspend?: Overspend;
}) {
  const overStyle = useSearchParams().get("over") ?? "dashed";
  const c = tone(status);
  const overspent = status === "overspent_cash" || status === "overspent_credit";

  if (overspent && overspend) {
    const coveredPct = (overspend.covered / overspend.spent) * 100;
    // label: a plain full bar; the rows print the excess in their caption.
    if (overStyle === "label") {
      return <div className="w-full rounded-full" style={{ height, background: c.solid }} />;
    }
    return (
      <div
        className="relative flex w-full items-center"
        style={{ height: Math.max(height, 4) + 6 }}
        role="img"
        aria-label={`Overspent ${overspend.excessLabel}`}
        title={`Overspent ${overspend.excessLabel}`}
      >
        <div
          className="rounded-s-full"
          style={{ width: `${coveredPct}%`, height, background: c.solid, opacity: 0.55 }}
        />
        <div
          className="rounded-e-full"
          style={{
            flex: 1,
            height,
            boxSizing: "border-box",
            ...(overStyle === "solid"
              ? { background: c.fg }
              : {
                  border: `1.5px dashed ${c.solid}`,
                  background: `repeating-linear-gradient(135deg, ${c.solid} 0 3px, transparent 3px 7px)`,
                }),
          }}
        />
        {coveredPct > 0 && (
          <div
            className="absolute top-0 h-full"
            style={{ insetInlineStart: `calc(${coveredPct}% - 1px)`, width: 2, background: "var(--p-text)" }}
            title="100%"
          />
        )}
      </div>
    );
  }

  const fill = overspent ? 1 : status === "none" ? 0 : progress;
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: "var(--p-track)" }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fill * 100)}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${fill * 100}%`,
          background: striped
            ? `repeating-linear-gradient(45deg, ${c.solid} 0 6px, transparent 6px 10px)`
            : c.solid,
          opacity: status === "snoozed" ? 0.5 : 1,
        }}
      />
    </div>
  );
}

// A money number shown in a colour pill, YNAB-style, coloured by status.
export function AvailablePill({
  amount,
  status,
  fmt,
}: {
  amount: number;
  status: Status;
  fmt: (n: number) => string;
}) {
  const c = tone(status === "none" ? (amount < 0 ? "overspent_cash" : "none") : status);
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-body font-medium tabular-nums"
      style={{ background: c.bg, color: c.fg }}
    >
      {fmt(amount)}
    </span>
  );
}

// --------------------------------------------------------------------------
// In-memory store standing in for the target/snooze server actions.

export function useTargetsStore(initial: ProtoCategory[], month: string, currency: string) {
  const [cats, setCats] = useState(initial);
  const [log, setLog] = useState<string[]>([]);
  // Money is wrapped in an LTR isolate (U+2066 … U+2069) so a minus sign
  // stays on the left of the amount inside RTL text.
  const fmt = useMemo(
    () => (n: number) => `\u2066${formatMilliunits(n, currency)}\u2069`,
    [currency],
  );

  function update(id: string, fn: (c: ProtoCategory) => ProtoCategory, message: string) {
    setCats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
    setLog((l) => [message, ...l].slice(0, 5));
  }

  const name = (id: string) => cats.find((c) => c.id === id)?.name ?? id;

  return {
    cats,
    fmt,
    month,
    log,
    evaluate: (c: ProtoCategory) => evaluate(c, month, fmt),
    totals: planTotals(cats, month, fmt),
    saveTarget(id: string, target: Omit<Target, "startMonth">) {
      update(
        id,
        (c) => ({
          ...c,
          previousTarget: c.target && c.target.startMonth !== month ? c.target : c.previousTarget,
          target: { ...target, startMonth: month },
        }),
        `upsert CategoryTarget(${name(id)}, startMonth=${month})`,
      );
    },
    removeTarget(id: string) {
      update(
        id,
        (c) => ({
          ...c,
          previousTarget: c.target && c.target.startMonth !== month ? c.target : c.previousTarget,
          target: null,
        }),
        `upsert CategoryTarget(${name(id)}, startMonth=${month}, kind=NONE)`,
      );
    },
    toggleSnooze(id: string) {
      const c = cats.find((x) => x.id === id);
      update(
        id,
        (c) => ({ ...c, snoozed: !c.snoozed }),
        c?.snoozed
          ? `delete CategoryTargetSnooze(${name(id)}, ${month})`
          : `create CategoryTargetSnooze(${name(id)}, ${month})`,
      );
    },
  };
}

export type Store = ReturnType<typeof useTargetsStore>;

// --------------------------------------------------------------------------
// The editor form. Every variant mounts it somewhere different (popover,
// inspector, inline row); the effective-from copy is the part being tested.

type Draft = {
  type: "SET_ASIDE" | "REFILL" | "BALANCE_DATED" | "BALANCE";
  cadence: Exclude<Cadence, null>;
  amount: string;
  weekday: number;
  dueDay: string;
  dueDate: string;
  dueMonth: string;
};

function draftFrom(t: Target | null): Draft {
  return {
    type: !t ? "SET_ASIDE" : t.kind === "BALANCE" ? (t.dueMonth ? "BALANCE_DATED" : "BALANCE") : t.kind,
    cadence: t?.cadence ?? "MONTHLY",
    amount: t ? String(milliunitsToNumber(t.amount)) : "",
    weekday: t?.weekday ?? 0,
    dueDay: t?.dueDay ? String(t.dueDay) : "",
    dueDate: t?.dueDate ?? "",
    dueMonth: t?.dueMonth ?? "",
  };
}

const field =
  "w-full rounded border px-2 py-1 text-body focus:outline-none focus:ring-1";
const fieldStyle = {
  background: "var(--p-surface)",
  borderColor: "var(--p-border)",
  color: "var(--p-text)",
};

export function TargetEditor({
  category,
  store,
  onDone,
  showActions = true,
}: {
  category: ProtoCategory;
  store: Store;
  onDone?: () => void;
  showActions?: boolean;
}) {
  const [d, setD] = useState<Draft>(() => draftFrom(category.target));
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const { month, fmt } = store;
  const earlier = category.target?.startMonth === month ? category.previousTarget : category.target;
  const isNewRow = category.target?.startMonth !== month;

  function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = numberToMilliunits(Number(d.amount) || 0);
    const target: Omit<Target, "startMonth"> =
      d.type === "BALANCE" || d.type === "BALANCE_DATED"
        ? { kind: "BALANCE", cadence: null, amount, dueMonth: d.type === "BALANCE_DATED" ? d.dueMonth : undefined }
        : {
            kind: d.type as TargetKind,
            cadence: d.cadence,
            amount,
            weekday: d.cadence === "WEEKLY" ? d.weekday : undefined,
            dueDay: d.cadence === "MONTHLY" && d.dueDay ? Number(d.dueDay) : undefined,
            dueDate: d.cadence === "YEARLY" ? d.dueDate : undefined,
          };
    store.saveTarget(category.id, target);
    onDone?.();
  }

  const isRecurring = d.type === "SET_ASIDE" || d.type === "REFILL";

  return (
    <form onSubmit={save} className="space-y-2 text-body">
      <div className="grid grid-cols-2 gap-1">
        {(
          [
            ["SET_ASIDE", "Set aside"],
            ["REFILL", "Refill up to"],
            ["BALANCE_DATED", "Balance by date"],
            ["BALANCE", "Balance, no date"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => set({ type: value })}
            className="rounded border px-2 py-1 text-small"
            style={{
              borderColor: d.type === value ? "var(--p-brand)" : "var(--p-border)",
              color: d.type === value ? "var(--p-brand)" : "var(--p-text-2)",
              fontWeight: d.type === value ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-small" style={{ color: "var(--p-text-2)" }}>
          Amount
        </span>
        <input
          inputMode="decimal"
          value={d.amount}
          onChange={(e) => set({ amount: e.target.value })}
          className={field}
          style={fieldStyle}
          required
        />
      </label>

      {isRecurring && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-small" style={{ color: "var(--p-text-2)" }}>
              Repeats
            </span>
            <select
              value={d.cadence}
              onChange={(e) => set({ cadence: e.target.value as Draft["cadence"] })}
              className={field}
              style={fieldStyle}
            >
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </label>
          {d.cadence === "WEEKLY" && (
            <label className="block">
              <span className="text-small" style={{ color: "var(--p-text-2)" }}>
                Every
              </span>
              <select
                value={d.weekday}
                onChange={(e) => set({ weekday: Number(e.target.value) })}
                className={field}
                style={fieldStyle}
              >
                {WEEKDAY_NAMES.map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          )}
          {d.cadence === "MONTHLY" && (
            <label className="block">
              <span className="text-small" style={{ color: "var(--p-text-2)" }}>
                Due day (optional)
              </span>
              <input
                inputMode="numeric"
                value={d.dueDay}
                onChange={(e) => set({ dueDay: e.target.value })}
                placeholder="e.g. 15"
                className={field}
                style={fieldStyle}
              />
            </label>
          )}
          {d.cadence === "YEARLY" && (
            <label className="block">
              <span className="text-small" style={{ color: "var(--p-text-2)" }}>
                Due date
              </span>
              <input
                type="date"
                value={d.dueDate}
                onChange={(e) => set({ dueDate: e.target.value })}
                className={field}
                style={fieldStyle}
                required
              />
            </label>
          )}
        </div>
      )}

      {d.type === "BALANCE_DATED" && (
        <label className="block">
          <span className="text-small" style={{ color: "var(--p-text-2)" }}>
            By month
          </span>
          <input
            type="month"
            value={d.dueMonth}
            onChange={(e) => set({ dueMonth: e.target.value })}
            className={field}
            style={fieldStyle}
            required
          />
        </label>
      )}

      <EffectiveFromNote
        month={month}
        earlier={earlier ?? null}
        isNewRow={isNewRow}
        fmt={fmt}
      />

      {showActions && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            className="rounded px-3 py-1 text-body font-medium text-white"
            style={{ background: "var(--p-brand)" }}
          >
            Save target
          </button>
          {category.target && (
            <>
              <button
                type="button"
                onClick={() => {
                  store.toggleSnooze(category.id);
                  onDone?.();
                }}
                className="rounded px-2 py-1 text-body"
                style={{ color: "var(--p-snooze-fg)" }}
              >
                <Icon name="snooze" /> {category.snoozed ? "Unsnooze" : `Snooze for ${monthLabel(month).split(" ")[0]}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  store.removeTarget(category.id);
                  onDone?.();
                }}
                className="ms-auto rounded px-2 py-1 text-body"
                style={{ color: "var(--p-cash-fg)" }}
              >
                <Icon name="delete" /> Remove
              </button>
            </>
          )}
          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="rounded px-2 py-1 text-body"
              style={{ color: "var(--p-text-2)" }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </form>
  );
}

function EffectiveFromNote({
  month,
  earlier,
  isNewRow,
  fmt,
}: {
  month: string;
  earlier: Target | null;
  isNewRow: boolean;
  fmt: (n: number) => string;
}) {
  const prev = monthLabel(previousMonthKey(month));
  return (
    <div
      className="flex gap-2 rounded border-s-4 px-2 py-1.5 text-small"
      style={{ borderColor: "var(--p-brand)", background: "var(--p-surface-2)", color: "var(--p-text-2)" }}
    >
      <Icon name="event_upcoming" />
      <div>
        <div style={{ color: "var(--p-text)" }}>
          Applies from <strong>{monthLabel(month)}</strong> onwards.
        </div>
        <div>
          {earlier
            ? `${prev} and earlier keep: ${describeTarget(earlier, fmt)}.`
            : `${prev} and earlier had no target, and stay that way.`}
          {!isNewRow && " (Replaces the change you already made this month.)"}
        </div>
      </div>
    </div>
  );
}

export function ChangeLog({ log }: { log: string[] }) {
  if (log.length === 0) return null;
  return (
    <div
      className="rounded border border-dashed p-2 font-mono text-small"
      style={{ borderColor: "var(--p-border)", color: "var(--p-text-2)" }}
    >
      <div className="mb-1 font-sans font-semibold">Prototype: writes that would happen</div>
      {log.map((l, i) => (
        <div key={i} dir="ltr">
          {l}
        </div>
      ))}
    </div>
  );
}

export function groupBy(cats: ProtoCategory[]) {
  const groups: { name: string; cats: ProtoCategory[] }[] = [];
  for (const c of cats) {
    let g = groups.find((x) => x.name === c.groupName);
    if (!g) groups.push((g = { name: c.groupName, cats: [] }));
    g.cats.push(c);
  }
  return groups;
}

// The Underfunded filter for variants B and C: hidden categories count.
export function underfundedOrVisible(store: Store, underfundedOnly: boolean) {
  return underfundedOnly
    ? store.cats.filter((c) => store.evaluate(c).status === "underfunded")
    : store.cats.filter((c) => !c.hidden);
}

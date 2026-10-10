"use client";

// PROTOTYPE (issue #148), variant B: "Inspector".
// A compact table with a status dot and an Available pill per row, and a
// side inspector (a bottom sheet on mobile) holding everything about the
// target: the numbers, the editor, snooze and remove. With nothing
// selected, the inspector shows the plan-level totals. The "Underfunded
// only" switch includes hidden categories (marked) and leaves snoozed out.

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { STATUS_LABEL, describeTarget, monthLabel } from "./model";
import type { ProtoCategory } from "./model";
import {
  AvailablePill,
  ChangeLog,
  ProgressBar,
  StatusChip,
  type Store,
  TargetEditor,
  groupBy,
  underfundedOrVisible,
  tone,
} from "./shared";


export function VariantB({ store }: { store: Store }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onlyUnderfunded, setOnlyUnderfunded] = useState(false);
  const { cats, evaluate, fmt } = store;
  const selected = cats.find((c) => c.id === selectedId) ?? null;

  const groups = groupBy(underfundedOrVisible(store, onlyUnderfunded));

  return (
    <div className="grid gap-200 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-2">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-body">
          <span
            className="relative inline-block h-5 w-9 rounded-full transition"
            style={{ background: onlyUnderfunded ? "var(--p-under)" : "var(--p-track)" }}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
              style={{ insetInlineStart: onlyUnderfunded ? 18 : 2 }}
            />
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={onlyUnderfunded}
            onChange={(e) => setOnlyUnderfunded(e.target.checked)}
          />
          Underfunded only
          <span className="text-small" style={{ color: "var(--p-text-2)" }}>
            ({store.totals.underfundedCount}, incl. hidden)
          </span>
        </label>

        <div
          className="overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--p-border)", background: "var(--p-surface)" }}
        >
          {groups.map((g) => (
            <div key={g.name}>
              <div
                className="px-200 py-1.5 text-small font-semibold uppercase tracking-wide"
                style={{ background: "var(--p-surface-2)", color: "var(--p-text-2)" }}
              >
                {g.name}
              </div>
              {g.cats.map((c) => {
                const e = evaluate(c);
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(active ? null : c.id)}
                    className="flex w-full items-center gap-2 border-b px-200 py-2 text-start text-body last:border-b-0"
                    style={{
                      borderColor: "var(--p-border)",
                      background: active ? "var(--p-surface-2)" : undefined,
                      borderInlineStart: `3px solid ${active ? "var(--p-brand)" : "transparent"}`,
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: e.status === "none" ? "transparent" : tone(e.status).solid,
                        border: e.status === "none" ? "1.5px solid var(--p-none)" : undefined,
                      }}
                      title={STATUS_LABEL[e.status]}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <bdi>{c.name}</bdi>
                    </span>
                    {c.hidden && <Icon name="visibility_off" className="shrink-0 opacity-60" />}
                    <span className="hidden w-24 shrink-0 text-small sm:block" style={{ color: tone(e.status).fg }}>
                      {e.status === "underfunded" ? `Needs ${fmt(e.needed)}` : STATUS_LABEL[e.status]}
                    </span>
                    <span className="shrink-0">
                      <AvailablePill amount={c.available} status={e.status} fmt={fmt} />
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && (
            <div className="px-200 py-300 text-body" style={{ color: "var(--p-text-2)" }}>
              Every target is funded this month.
            </div>
          )}
        </div>
        <ChangeLog log={store.log} />
      </div>

      {/* Desktop: sticky side panel. Mobile: bottom sheet when selected. */}
      <aside className="hidden lg:block">
        <div
          className="sticky top-4 rounded-lg border p-200"
          style={{ borderColor: "var(--p-border)", background: "var(--p-surface)" }}
        >
          {selected ? (
            <Inspector key={selected.id} c={selected} store={store} onClose={() => setSelectedId(null)} />
          ) : (
            <PlanSummary store={store} />
          )}
        </div>
      </aside>
      {selected && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 lg:hidden" onClick={() => setSelectedId(null)}>
          <div
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-xl p-200"
            style={{ background: "var(--p-surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Inspector key={selected.id} c={selected} store={store} onClose={() => setSelectedId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, fg }: { label: string; value: string; fg?: string }) {
  return (
    <div>
      <div className="text-small" style={{ color: "var(--p-text-2)" }}>
        {label}
      </div>
      <div className="text-h3 tabular-nums" style={{ color: fg }}>
        {value}
      </div>
    </div>
  );
}

function Inspector({ c, store, onClose }: { c: ProtoCategory; store: Store; onClose: () => void }) {
  const e = store.evaluate(c);
  const { fmt, month } = store;
  const [editing, setEditing] = useState(!c.target);

  return (
    <div className="space-y-200">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-h3">
            <bdi>{c.name}</bdi>
          </div>
          <div className="text-small" style={{ color: "var(--p-text-2)" }}>
            {c.groupName} · {monthLabel(month)}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1" title="Close">
          <Icon name="close" label="Close" />
        </button>
      </div>

      <StatusChip status={e.status} />

      {c.target && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Needed" value={fmt(e.needed)} fg={e.needed > 0 ? "var(--p-under-fg)" : undefined} />
            <Stat label="Funded" value={fmt(e.fundedTowardAsk)} />
            <Stat label="Due" value={e.dueLabel.replace(/^(by|due) /, "")} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-small" style={{ color: "var(--p-text-2)" }}>
              <span>This month</span>
              <span className="tabular-nums">
                {fmt(e.fundedTowardAsk)} / {fmt(e.monthlyAsk)}
              </span>
            </div>
            <ProgressBar status={e.status} progress={e.progress} height={8} />
          </div>
          {e.overall && (
            <div>
              <div className="mb-1 flex justify-between text-small" style={{ color: "var(--p-text-2)" }}>
                <span>Whole target</span>
                <span className="tabular-nums">
                  {fmt(e.overall.have)} / {fmt(e.overall.goal)}
                </span>
              </div>
              <ProgressBar
                status={e.status === "underfunded" ? "on_track" : e.status}
                progress={Math.min(1, e.overall.have / e.overall.goal)}
                height={8}
                striped
              />
            </div>
          )}
          <p className="text-small" style={{ color: tone(e.status).fg }}>
            {e.summary}
          </p>
        </>
      )}

      <div className="border-t pt-200" style={{ borderColor: "var(--p-border)" }}>
        {editing ? (
          <TargetEditor
            category={c}
            store={store}
            onDone={c.target ? () => setEditing(false) : undefined}
          />
        ) : (
          <div className="space-y-2">
            <div className="text-small" style={{ color: "var(--p-text-2)" }}>
              Target (since {monthLabel(c.target!.startMonth)})
            </div>
            <div className="text-body">{describeTarget(c.target, fmt)}</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded border px-3 py-1 text-body"
                style={{ borderColor: "var(--p-border)" }}
              >
                <Icon name="edit" /> Edit
              </button>
              <button
                type="button"
                onClick={() => store.toggleSnooze(c.id)}
                className="rounded border px-3 py-1 text-body"
                style={{ borderColor: "var(--p-border)", color: "var(--p-snooze-fg)" }}
              >
                <Icon name="snooze" /> {c.snoozed ? "Unsnooze" : "Snooze this month"}
              </button>
              <button
                type="button"
                onClick={() => store.removeTarget(c.id)}
                className="rounded border px-3 py-1 text-body"
                style={{ borderColor: "var(--p-border)", color: "var(--p-cash-fg)" }}
              >
                <Icon name="delete" /> Remove
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanSummary({ store }: { store: Store }) {
  const { totals, fmt, month } = store;
  return (
    <div className="space-y-200">
      <div className="text-h3">{monthLabel(month)}</div>
      <div className="grid grid-cols-2 gap-200">
        <Stat label="Underfunded" value={fmt(totals.underfundedTotal)} fg="var(--p-under-fg)" />
        <Stat label="Overspending to cover" value={fmt(totals.overspentToCover)} fg="var(--p-cash-fg)" />
        <Stat label="Cost to Be Me" value={fmt(totals.costToBeMe)} />
        <Stat label="Snoozed" value={String(totals.snoozedCount)} fg="var(--p-snooze-fg)" />
      </div>
      <p className="text-small" style={{ color: "var(--p-text-2)" }}>
        Underfunded counts hidden categories ({totals.underfundedHiddenCount}) and leaves snoozed ones
        out. Select a category to see and edit its target.
      </p>
    </div>
  );
}

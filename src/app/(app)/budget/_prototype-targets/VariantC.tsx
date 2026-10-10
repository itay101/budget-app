"use client";

// PROTOTYPE (issue #148), variant C: "Target column".
// A dedicated Target column with a labelled bar ("₪250 of ₪400") and a
// status chip, group headers that roll up what each group still needs,
// and a banner that turns the Underfunded total into the filter. Rows
// expand in place to edit the target, with the target's history shown.
// The filter includes hidden categories, shown in their real group with a
// hidden marker, and says how many snoozed ones it skipped.

import { Fragment, useState } from "react";
import { Icon } from "@/components/Icon";
import { describeTarget, monthLabel, previousMonthKey } from "./model";
import type { ProtoCategory } from "./model";
import {
  ChangeLog,
  ProgressBar,
  overspendOf,
  StatusChip,
  type Store,
  TargetEditor,
  groupBy,
  underfundedOrVisible,
  tone,
} from "./shared";


export function VariantC({ store }: { store: Store }) {
  const [filtered, setFiltered] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { cats, evaluate, totals, fmt } = store;

  const groups = groupBy(underfundedOrVisible(store, filtered));

  return (
    <div className="space-y-200">
      <div
        className="flex flex-wrap items-center gap-x-200 gap-y-2 rounded-lg px-200 py-2"
        style={{
          background: totals.underfundedCount ? "var(--p-under-bg)" : "var(--p-funded-bg)",
          color: totals.underfundedCount ? "var(--p-under-fg)" : "var(--p-funded-fg)",
        }}
      >
        <Icon name={totals.underfundedCount ? "error" : "check_circle"} />
        <div className="min-w-0 flex-1 text-body">
          {totals.underfundedCount ? (
            <>
              <strong>{fmt(totals.underfundedTotal)}</strong> still needed across{" "}
              {totals.underfundedCount} categories
              {totals.overspentToCover > 0 && (
                <>, plus <strong>{fmt(totals.overspentToCover)}</strong> overspending to cover</>
              )}
              .
              <span className="block text-small opacity-80">
                {totals.underfundedHiddenCount > 0 && `${totals.underfundedHiddenCount} hidden included. `}
                {totals.snoozedCount > 0 && `${totals.snoozedCount} snoozed not counted.`}
              </span>
            </>
          ) : (
            "Every target is funded this month."
          )}
        </div>
        {totals.underfundedCount > 0 && (
          <button
            type="button"
            onClick={() => setFiltered((f) => !f)}
            className="rounded border px-3 py-1 text-body font-medium"
            style={{ borderColor: "currentColor" }}
          >
            {filtered ? "Show all" : "Show only these"}
          </button>
        )}
      </div>

      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: "var(--p-border)", background: "var(--p-surface)" }}
      >
        <div
          className="hidden border-b px-200 py-2 text-small font-medium uppercase tracking-wide md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_100px_110px] md:gap-3"
          style={{ borderColor: "var(--p-border)", background: "var(--p-surface-2)", color: "var(--p-text-2)" }}
        >
          <div>Category</div>
          <div>Target · {monthLabel(store.month)}</div>
          <div className="text-end">Assigned</div>
          <div className="text-end">Available</div>
        </div>

        {groups.map((g) => {
          const need = g.cats.reduce((s, c) => s + evaluate(c).needed, 0);
          return (
            <Fragment key={g.name}>
              <div
                className="flex items-center gap-2 px-200 py-1.5 text-small font-semibold uppercase tracking-wide"
                style={{ background: "var(--p-surface-2)", color: "var(--p-text-2)" }}
              >
                <span className="flex-1">{g.name}</span>
                {need > 0 && (
                  <span className="normal-case tracking-normal" style={{ color: "var(--p-under-fg)" }}>
                    {fmt(need)} needed
                  </span>
                )}
              </div>
              {g.cats.map((c) => (
                <Row
                  key={c.id}
                  c={c}
                  store={store}
                  open={openId === c.id}
                  toggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
                />
              ))}
            </Fragment>
          );
        })}
      </div>
      <ChangeLog log={store.log} />
    </div>
  );
}

function Row({
  c,
  store,
  open,
  toggle,
}: {
  c: ProtoCategory;
  store: Store;
  open: boolean;
  toggle: () => void;
}) {
  const e = store.evaluate(c);
  const { fmt, month } = store;
  const label =
    e.status === "none"
      ? null
      : e.monthlyAsk > 0
        ? `${fmt(e.fundedTowardAsk)} of ${fmt(e.monthlyAsk)}`
        : null;

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: "var(--p-border)" }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-200 py-2 text-start text-body md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_100px_110px] md:items-center"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon name={open ? "expand_less" : "expand_more"} className="shrink-0 opacity-60" />
          <span className="truncate">
            <bdi>{c.name}</bdi>
          </span>
          {c.hidden && <Icon name="visibility_off" className="shrink-0 opacity-60" />}
          {c.isPayment && <Icon name="credit_card" className="shrink-0 opacity-60" />}
        </div>

        <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
          {e.status === "none" ? (
            <span className="text-small" style={{ color: "var(--p-text-2)" }}>
              <Icon name="add" /> Add target
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ProgressBar status={e.status} progress={e.progress} height={10} overspend={overspendOf(c, fmt)} />
                <div className="mt-0.5 flex justify-between gap-2 text-small" style={{ color: "var(--p-text-2)" }}>
                  <span className="truncate tabular-nums">{label}</span>
                  <span className="shrink-0">{overspendOf(c, fmt)?.excessLabel ?? e.dueLabel}</span>
                </div>
              </div>
              {/* Fixed-width slot so every bar has the same width (preview feedback). */}
              <div className="w-40 shrink-0 text-end">
                <StatusChip status={e.status}>
                  {e.status === "underfunded" ? `${fmt(e.needed)} more` : undefined}
                </StatusChip>
              </div>
            </div>
          )}
        </div>

        <div className="hidden text-end tabular-nums md:block">{fmt(c.assigned)}</div>
        <div className="text-end font-medium tabular-nums" style={{ color: c.available < 0 ? tone(e.status).fg : undefined }}>
          {fmt(c.available)}
        </div>
      </button>

      {open && (
        <div className="grid gap-200 px-200 pb-200 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" style={{ background: "var(--p-surface-2)" }}>
          <div className="pt-200">
            <TargetEditor category={c} store={store} onDone={toggle} />
          </div>
          <div className="space-y-2 pt-200 text-small" style={{ color: "var(--p-text-2)" }}>
            <div className="font-semibold" style={{ color: "var(--p-text)" }}>
              Target history
            </div>
            <ol className="space-y-1">
              {c.target && (
                <li>
                  <strong>{monthLabel(c.target.startMonth)} →</strong> {describeTarget(c.target, fmt)}
                </li>
              )}
              {!c.target && c.previousTarget && (
                <li>
                  <strong>{monthLabel(month)} →</strong> No target
                </li>
              )}
              {c.previousTarget && (
                <li>
                  <strong>
                    {monthLabel(c.previousTarget.startMonth)} – {monthLabel(previousMonthKey(c.target?.startMonth ?? month))}
                  </strong>{" "}
                  {describeTarget(c.previousTarget, fmt)}
                </li>
              )}
              {!c.target && !c.previousTarget && <li>Never had a target.</li>}
            </ol>
            {c.target && (
              <div className="pt-2">
                <div className="font-semibold" style={{ color: "var(--p-text)" }}>
                  This month
                </div>
                <div>Needed: {fmt(e.needed)}</div>
                <div>Funded so far: {fmt(e.fundedTowardAsk)} of {fmt(e.monthlyAsk)}</div>
                <div>Due: {e.dueLabel}</div>
                {e.overall && (
                  <div>
                    Whole target: {fmt(e.overall.have)} of {fmt(e.overall.goal)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

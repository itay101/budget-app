"use client";

// PROTOTYPE (issue #148), variant A: "Bar under the name".
// Today's table, plus a thin progress bar and a one-line status under each
// category name, a coloured Available pill, and filter tabs over the table.
// The target is edited in a popover from the row. The Underfunded tab
// leaves hidden and snoozed categories out (hidden stay in their own
// section, and only on "All").

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { usePopover } from "@/components/usePopover";
import type { ProtoCategory } from "./model";
import {
  AvailablePill,
  ChangeLog,
  ProgressBar,
  overspendOf,
  type Store,
  TargetEditor,
  groupBy,
  tone,
} from "./shared";


type Filter = "all" | "underfunded" | "overspent" | "snoozed";

export function VariantA({ store }: { store: Store }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { cats, evaluate, totals, fmt } = store;

  const visible = cats.filter((c) => !c.hidden);
  const matches = (c: ProtoCategory) => {
    const s = evaluate(c).status;
    if (filter === "underfunded") return s === "underfunded";
    if (filter === "overspent") return s === "overspent_cash" || s === "overspent_credit";
    if (filter === "snoozed") return s === "snoozed";
    return true;
  };
  const counts = {
    underfunded: visible.filter((c) => evaluate(c).status === "underfunded").length,
    overspent: visible.filter((c) => evaluate(c).status.startsWith("overspent")).length,
    snoozed: visible.filter((c) => evaluate(c).status === "snoozed").length,
  };
  const groups = groupBy(visible.filter(matches));
  const hidden = cats.filter((c) => c.hidden);

  const tabs: [Filter, string, number | null][] = [
    ["all", "All", null],
    ["underfunded", "Underfunded", counts.underfunded],
    ["overspent", "Overspent", counts.overspent],
    ["snoozed", "Snoozed", counts.snoozed],
  ];

  return (
    <div className="space-y-200">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          className="flex overflow-x-auto rounded-lg border p-0.5"
          style={{ borderColor: "var(--p-border)", background: "var(--p-surface)" }}
        >
          {tabs.map(([key, label, n]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className="whitespace-nowrap rounded-md px-3 py-1 text-body"
              style={
                filter === key
                  ? { background: "var(--p-brand)", color: "#fff" }
                  : { color: "var(--p-text-2)" }
              }
            >
              {label}
              {n !== null && <span className="ms-1 opacity-80">{n}</span>}
            </button>
          ))}
        </div>
        <div className="text-small" style={{ color: "var(--p-text-2)" }}>
          Underfunded: <strong style={{ color: "var(--p-under-fg)" }}>{fmt(totals.underfundedTotal)}</strong>
          {totals.underfundedHiddenCount > 0 &&
            ` (incl. ${totals.underfundedHiddenCount} hidden)`}
        </div>
      </div>

      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: "var(--p-border)", background: "var(--p-surface)" }}
      >
        <div
          className="hidden border-b px-200 py-2 text-small font-medium uppercase tracking-wide sm:grid sm:grid-cols-[1fr_110px_110px_130px]"
          style={{ borderColor: "var(--p-border)", background: "var(--p-surface-2)", color: "var(--p-text-2)" }}
        >
          <div>Category</div>
          <div className="text-end">Assigned</div>
          <div className="text-end">Activity</div>
          <div className="text-end">Available</div>
        </div>

        {groups.map((g) => (
          <div key={g.name}>
            <div
              className="px-200 py-1.5 text-small font-semibold uppercase tracking-wide"
              style={{ background: "var(--p-surface-2)", color: "var(--p-text-2)" }}
            >
              {g.name}
            </div>
            {g.cats.map((c) => (
              <Row key={c.id} c={c} store={store} />
            ))}
          </div>
        ))}
        {groups.length === 0 && (
          <div className="px-200 py-300 text-body" style={{ color: "var(--p-text-2)" }}>
            Nothing {filter} this month.
          </div>
        )}
        {filter === "all" && hidden.length > 0 && (
          <div>
            <div
              className="px-200 py-1.5 text-small font-semibold uppercase tracking-wide"
              style={{ background: "var(--p-surface-2)", color: "var(--p-text-2)" }}
            >
              <Icon name="visibility_off" /> Hidden
            </div>
            {hidden.map((c) => (
              <Row key={c.id} c={c} store={store} />
            ))}
          </div>
        )}
      </div>
      <ChangeLog log={store.log} />
    </div>
  );
}

function Row({ c, store }: { c: ProtoCategory; store: Store }) {
  const e = store.evaluate(c);
  const { fmt } = store;
  const { open, setOpen, position, triggerRef, panelRef } = usePopover({ width: 320 });
  return (
    <div
      className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b px-200 py-2 text-body last:border-b-0 sm:grid-cols-[1fr_110px_110px_130px] sm:items-center"
      style={{ borderColor: "var(--p-border)" }}
    >
      <div className="min-w-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="block w-full min-w-0 rounded text-start"
          title="Edit target"
        >
          <div className="flex items-center gap-1.5">
            <span className="truncate">
              <bdi>{c.name}</bdi>
            </span>
            {c.isPayment && <Icon name="credit_card" className="shrink-0 opacity-60" />}
          </div>
          {e.status !== "none" ? (
            <>
              <div className="mt-1">
                <ProgressBar status={e.status} progress={e.progress} overspend={overspendOf(c, fmt)} />
              </div>
              <div className="mt-0.5 truncate text-small" style={{ color: tone(e.status).fg }}>
                {e.summary}
              </div>
            </>
          ) : (
            <div className="mt-0.5 text-small" style={{ color: "var(--p-text-2)" }}>
              <Icon name="add" /> Add target
            </div>
          )}
        </button>
      </div>
      <div className="hidden text-end tabular-nums sm:block">{fmt(c.assigned)}</div>
      <div className="hidden text-end tabular-nums sm:block" style={{ color: "var(--p-text-2)" }}>
        {fmt(c.activity)}
      </div>
      <div className="self-start text-end sm:self-auto">
        <AvailablePill amount={c.available} status={e.status} fmt={fmt} />
      </div>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="proto-popover z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg border p-3 shadow-lg"
          >
            <div className="mb-2 text-body font-semibold">
              Target for <bdi>{c.name}</bdi>
            </div>
            <TargetEditor category={c} store={store} onDone={() => setOpen(false)} />
          </div>,
          document.querySelector(".proto-root") ?? document.body,
        )}
    </div>
  );
}

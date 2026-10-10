"use client";

// PROTOTYPE (#145): three variants of credit cards on the existing /budget
// route, switchable via `?variant=A|B|C` (and `?theme=dark`) from the
// floating bar. Card and overspending rows are in-memory mock data; your real
// category groups render underneath them for context. Throwaway: lives on its
// own branch, never merged.

import { useMemo, useState } from "react";
import { PrototypeSwitcher } from "@/components/PrototypeSwitcher";
import { formatMilliunits } from "@/lib/money";
import {
  initialState,
  pay,
  releaseClosed,
  setBudgeted,
  viewCards,
  viewRow,
  type CardView,
  type ProtoState,
  type RowView,
} from "./model";
import type { ProtoActions } from "./shared";
import { t } from "./tokens";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";

export type VariantProps = {
  state: ProtoState;
  cards: CardView[];
  rows: RowView[];
  currency: string;
  actions: ProtoActions;
  nextMonthName: string;
  addGroupButton: React.ReactNode;
  realGroups: React.ReactNode;
  realHidden: React.ReactNode;
};

const VARIANTS = [
  { key: "A", name: "YNAB-style rows", Component: VariantA },
  { key: "B", name: "Card panel", Component: VariantB },
  { key: "C", name: "Inspector", Component: VariantC },
];

export function CreditCardsPrototype({
  variant,
  theme,
  currency,
  nextMonthName,
  addGroupButton,
  realGroups,
  realHidden,
}: {
  variant: string;
  theme: string;
  currency: string;
  nextMonthName: string;
  addGroupButton: React.ReactNode;
  realGroups: React.ReactNode;
  realHidden: React.ReactNode;
}) {
  const [state, setState] = useState<ProtoState>(initialState);
  const cards = useMemo(() => viewCards(state), [state]);
  const rows = useMemo(() => state.rows.map(viewRow), [state]);
  const current = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0];
  const dark = theme === "dark";

  const actions: ProtoActions = {
    pay: (cardId, fromId, amount) => setState((s) => pay(s, cardId, fromId, amount)),
    releaseClosed: (cardId) => setState((s) => releaseClosed(s, cardId)),
    setBudgeted: (id, amount) => setState((s) => setBudgeted(s, id, amount)),
  };

  const Component = current.Component;
  return (
    <div className={dark ? "dark" : undefined}>
      <div className={dark ? "-m-200 rounded-lg bg-[#1D2125] p-200 sm:-m-300 sm:p-300" : undefined}>
        <Component
          state={state}
          cards={cards}
          rows={rows}
          currency={currency}
          actions={actions}
          nextMonthName={nextMonthName}
          addGroupButton={addGroupButton}
          // The app has no dark mode, so real rows would clash; hide them in dark.
          realGroups={dark ? null : realGroups}
          realHidden={dark ? null : realHidden}
        />

        <details className={`mt-300 mb-20 rounded-lg border px-3 py-2 text-small ${t.border} ${t.surface} ${t.muted}`}>
          <summary className="cursor-pointer">Prototype state</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th>Card</th>
                  <th className="text-right">Owes</th>
                  <th className="text-right">Available</th>
                  <th className="text-right">Short</th>
                </tr>
              </thead>
              <tbody className={t.text}>
                {cards.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <bdi>{c.name}</bdi>
                      {c.closed && " (closed)"}
                    </td>
                    <td className="text-right">{formatMilliunits(c.owed, currency)}</td>
                    <td className="text-right">{formatMilliunits(c.available, currency)}</td>
                    <td className="text-right">{formatMilliunits(c.shortfall, currency)}</td>
                  </tr>
                ))}
                {state.cashAccounts.map((a) => (
                  <tr key={a.id}>
                    <td><bdi>{a.name}</bdi></td>
                    <td className="text-right" colSpan={3}>
                      {formatMilliunits(a.balance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <div className="font-medium">Log</div>
              {state.log.length === 0 ? (
                <p>No actions yet. Pay a card or release a closed card.</p>
              ) : (
                <ol className={`list-decimal ps-5 ${t.text}`}>
                  {state.log.map((l, i) => (
                    <li key={i}>
                      <bdi>{l}</bdi>
                    </li>
                  ))}
                </ol>
              )}
              <button
                type="button"
                onClick={() => setState(initialState)}
                className={`mt-2 rounded px-2 py-0.5 ${t.ghostBtn}`}
              >
                Reset
              </button>
            </div>
          </div>
        </details>
      </div>

      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={current.key}
        toggle={{ param: "theme", on: "dark", label: dark ? "Dark" : "Light" }}
      />
    </div>
  );
}

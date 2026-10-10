"use client";

// PROTOTYPE (#145) — Variant B, "Card panel": cards get their own panel of
// tiles above the table instead of rows in it. Each tile is account-centric
// (what the card owes vs what's set aside, with a progress bar and where any
// gap came from) and is where paying starts. Spending rows show a stacked bar
// of how the month's spending was paid for, with plain-language chips for
// each kind of overspending.

import { useState } from "react";
import { formatMilliunits } from "@/lib/money";
import { Icon } from "@/components/Icon";
import type { CardView, RowView } from "./model";
import { Name, PayCardDialog, GroupHeading, MockDataTag, splitCards, TableHeader } from "./shared";
import { t } from "./tokens";
import type { VariantProps } from "./CreditCardsPrototype";

function CardTile({
  card,
  currency,
  onPay,
}: {
  card: CardView;
  currency: string;
  onPay: () => void;
}) {
  const fmt = (n: number) => formatMilliunits(n, currency);
  const owed = Math.max(card.owed, 0);
  const pct = owed === 0 ? 100 : Math.min(100, (Math.max(card.available, 0) / owed) * 100);
  const thisMonthCredit = card.creditSources.reduce((a, s) => a + s.amount, 0);
  const older = Math.max(0, card.shortfall - thisMonthCredit);

  return (
    <div className={`flex flex-col gap-2 rounded-lg border p-3 ${t.border} ${t.surface}`}>
      <div className="flex items-center gap-2">
        <Icon name="credit_card" className={t.faint} />
        <span className={`min-w-0 flex-1 truncate font-medium ${t.text}`}>
          <bdi>{card.name}</bdi>
        </span>
        <a href="#" title="Open card account" className={`shrink-0 rounded p-1 ${t.faint} ${t.hover}`}>
          <Icon name="open_in_new" label="Open card account" />
        </a>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={`text-small ${t.muted}`}>{card.owed < 0 ? "In credit" : "Owes"}</div>
          <div className={`text-h3 ${t.text}`}>{fmt(Math.abs(card.owed))}</div>
        </div>
        <div className="text-right">
          <div className={`text-small ${t.muted}`}>Set aside</div>
          <div className={`text-h3 ${card.available < 0 ? t.cash : t.ok}`}>{fmt(card.available)}</div>
        </div>
      </div>

      <div className={`h-2 overflow-hidden rounded-full ${t.surfaceAlt}`}>
        <div
          className={`h-full ${card.shortfall > 0 ? t.creditBg : t.okBg}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {card.shortfall > 0 ? (
        <div className={`rounded px-2 py-1.5 text-small ${t.creditTint} ${t.text}`}>
          <div className={`font-medium ${t.credit}`}>{fmt(card.shortfall)} not set aside</div>
          <ul className="mt-0.5 space-y-0.5">
            {card.creditSources.map((s) => (
              <li key={s.rowId} className="flex justify-between gap-2">
                <span className="truncate">
                  <Name>{s.name}</Name> overspent
                </span>
                <span className="shrink-0">{fmt(s.amount)}</span>
              </li>
            ))}
            {older > 0 && (
              <li className="flex justify-between gap-2">
                <span className="truncate">Earlier debt</span>
                <span className="shrink-0">{fmt(older)}</span>
              </li>
            )}
          </ul>
        </div>
      ) : (
        <div className={`text-small ${t.ok}`}>
          <Icon name="check_circle" /> {card.owed > 0 ? "Fully set aside" : "Nothing to pay"}
        </div>
      )}

      <button
        type="button"
        onClick={onPay}
        disabled={card.owed <= 0}
        className={`mt-auto rounded px-3 py-1.5 text-body font-medium disabled:opacity-40 ${t.brandBtn}`}
      >
        Pay card
      </button>
    </div>
  );
}

function SpendBar({ row, currency }: { row: RowView; currency: string }) {
  const fmt = (n: number) => formatMilliunits(n, currency);
  const spent = row.cashSpending + row.cardTotal;
  const scale = Math.max(spent, row.budgeted, 1);
  const cashCovered = row.cashSpending - row.cashOverspend;
  const seg = (n: number) => `${(n / scale) * 100}%`;
  return (
    <div className="col-span-2 space-y-1 sm:col-span-4">
      <div className={`flex h-1.5 overflow-hidden rounded-full ${t.surfaceAlt}`}>
        <div className={t.okBg} style={{ width: seg(cashCovered + row.funded) }} title="Covered" />
        <div className={t.cashBg} style={{ width: seg(row.cashOverspend) }} title="Cash overspending" />
        <div className={t.creditBg} style={{ width: seg(row.creditOverspend) }} title="Credit overspending" />
      </div>
      {(row.cashOverspend > 0 || row.creditOverspend > 0) && (
        <div className="flex flex-wrap gap-1">
          {row.cashOverspend > 0 && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-small ${t.cashTint} ${t.cash}`}>
              <Icon name="account_balance_wallet" />
              {fmt(row.cashOverspend)} cash overspent · from next month&rsquo;s Ready to Assign
            </span>
          )}
          {row.creditOverspend > 0 && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-small ${t.creditTint} ${t.credit}`}>
              <Icon name="credit_card" />
              {fmt(row.creditOverspend)} on credit · added to card debt
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function VariantB({
  cards,
  rows,
  state,
  currency,
  actions,
  addGroupButton,
  realGroups,
  realHidden,
}: VariantProps) {
  const [paying, setPaying] = useState<string | null>(null);
  const fmt = (n: number) => formatMilliunits(n, currency);
  const { open, closed } = splitCards(cards);
  const payingCard = cards.find((c) => c.id === paying);
  const totalShort = open.reduce((a, c) => a + c.shortfall, 0);

  return (
    <div className="space-y-300">
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={`text-h3 ${t.text}`}>Credit Card Payments</h2>
          {totalShort > 0 && (
            <span className={`text-small ${t.credit}`}>
              {fmt(totalShort)} of card debt isn&rsquo;t set aside yet
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((card) => (
            <CardTile key={card.id} card={card} currency={currency} onPay={() => setPaying(card.id)} />
          ))}
        </div>
        {closed.length > 0 && (
          <details className={`rounded-lg border px-3 py-2 ${t.border} ${t.surface}`}>
            <summary className={`cursor-pointer text-small ${t.muted}`}>
              Closed cards ({closed.length}) ·{" "}
              {fmt(closed.reduce((a, c) => a + c.available, 0))} still set aside
            </summary>
            <ul className="mt-2 space-y-1">
              {closed.map((card) => (
                <li key={card.id} className={`flex flex-wrap items-center gap-2 text-body ${t.text}`}>
                  <span className="min-w-0 flex-1 truncate">
                    <bdi>{card.name}</bdi>
                  </span>
                  <span className={t.ok}>{fmt(card.available)}</span>
                  <button
                    type="button"
                    onClick={() => actions.releaseClosed(card.id)}
                    className={`rounded px-2 py-0.5 text-small ${t.ghostBtn}`}
                  >
                    Move to Ready to Assign
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <div className={`overflow-hidden rounded-lg border ${t.border} ${t.surface}`}>
        <TableHeader addGroupButton={addGroupButton} />
        <GroupHeading>
          <span>Everyday</span>
          <MockDataTag />
        </GroupHeading>
        {rows.map((row) => (
          <div
            key={row.id}
            className={`grid grid-cols-2 gap-x-3 gap-y-2 border-b px-200 py-3 text-body sm:grid-cols-[1fr_120px_120px_120px] sm:items-center sm:gap-2 sm:py-2 ${t.rowBorder}`}
          >
            <div className={`col-span-2 truncate sm:col-span-1 ${t.text}`}>
              <bdi>{row.name}</bdi>
            </div>
            <div className={`sm:text-right ${t.text}`}>
              <div className={`text-small sm:hidden ${t.muted}`}>Budgeted</div>
              {fmt(row.budgeted)}
            </div>
            <div className={`sm:text-right ${t.text}`}>
              <div className={`text-small sm:hidden ${t.muted}`}>Activity</div>
              {fmt(row.activity)}
            </div>
            <div className="col-span-2 flex justify-between sm:col-span-1 sm:block sm:text-right">
              <div className={`text-small sm:hidden ${t.muted}`}>Available</div>
              <span className={`font-medium ${row.available < 0 ? t.text : t.ok}`}>{fmt(row.available)}</span>
            </div>
            <SpendBar row={row} currency={currency} />
          </div>
        ))}
        {realGroups}
        {realHidden}
      </div>

      {payingCard && (
        <PayCardDialog
          card={payingCard}
          cashAccounts={state.cashAccounts}
          currency={currency}
          onPay={actions.pay}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}

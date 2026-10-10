"use client";

// PROTOTYPE (#145) — Variant A, "Inline rows": everything stays in the
// existing four-column table. Payment Category rows carry the card balance
// as a second line under Available, overspending is a coloured pill (red =
// cash, amber = credit, split pill = both), and paying starts from a Pay
// button on the Payment Category row.

import { useState } from "react";
import { formatMilliunits } from "@/lib/money";
import { Icon } from "@/components/Icon";
import type { CardView, RowView } from "./model";
import { PayCardDialog, GroupHeading, MockDataTag, splitCards, TableHeader } from "./shared";
import { t } from "./tokens";
import type { VariantProps } from "./CreditCardsPrototype";

const rowGrid =
  "grid grid-cols-2 gap-x-3 gap-y-2 border-b px-200 py-3 text-body last:border-b-0 sm:grid-cols-[1fr_120px_120px_120px] sm:items-center sm:gap-2 sm:py-2";

function MobileLabel({ children }: { children: string }) {
  return <div className={`text-small sm:hidden ${t.muted}`}>{children}</div>;
}

function AvailablePill({ row, currency }: { row: RowView; currency: string }) {
  const fmt = (n: number) => formatMilliunits(n, currency);
  if (row.available >= 0) {
    return (
      <span className={`inline-block rounded-full px-2 py-0.5 font-medium ${t.ok}`}>
        {fmt(row.available)}
      </span>
    );
  }
  const both = row.cashOverspend > 0 && row.creditOverspend > 0;
  if (both) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span
          className={`inline-block px-2 py-0.5 font-medium ${t.cash}`}
          title={`${fmt(-row.cashOverspend)} cash overspending, ${fmt(-row.creditOverspend)} credit overspending`}
        >
          {fmt(row.available)}
        </span>
        <span className={`rounded-full px-2 text-small text-neutral-0 ${t.cashBg} dark:text-[#1D2125]`}>
          {fmt(-row.cashOverspend)} cash
        </span>
        <span className={`rounded-full px-2 text-small text-neutral-800 ${t.creditBg} dark:text-[#1D2125]`}>
          {fmt(-row.creditOverspend)} card
        </span>
      </span>
    );
  }
  const isCash = row.cashOverspend > 0;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 font-medium ${
        isCash
          ? `text-neutral-0 ${t.cashBg} dark:text-[#1D2125]`
          : `text-neutral-800 ${t.creditBg} dark:text-[#1D2125]`
      }`}
      title={isCash ? "Cash overspending" : "Credit overspending"}
    >
      {fmt(row.available)}
    </span>
  );
}

function PaymentRow({
  card,
  currency,
  onPay,
}: {
  card: CardView;
  currency: string;
  onPay: () => void;
}) {
  const fmt = (n: number) => formatMilliunits(n, currency);
  return (
    <div className={`${rowGrid} ${t.rowBorder}`}>
      <div className={`col-span-2 flex min-w-0 items-center gap-1.5 sm:col-span-1 ${t.text}`}>
        <Icon name="credit_card" className={t.faint} />
        <span className="truncate">
          <bdi>{card.name}</bdi>
        </span>
        <button
          type="button"
          onClick={onPay}
          className={`ms-auto shrink-0 rounded px-2 py-0.5 text-small font-medium sm:ms-1 ${t.ghostBtn}`}
        >
          Pay
        </button>
      </div>
      <div className={`sm:text-right ${t.text}`}>
        <MobileLabel>Budgeted</MobileLabel>
        {fmt(card.budgeted)}
      </div>
      <div className={`sm:text-right ${t.text}`}>
        <MobileLabel>Activity</MobileLabel>
        {fmt(card.activity)}
      </div>
      <div className="col-span-2 flex items-baseline justify-between gap-2 sm:col-span-1 sm:block sm:text-right">
        <MobileLabel>Available</MobileLabel>
        <div>
          <div className={`font-medium ${card.available < 0 ? t.cash : t.ok}`}>
            {fmt(card.available)}
          </div>
          <div className={`text-small ${t.muted}`}>
            {card.owed < 0 ? `Card in credit ${fmt(-card.owed)}` : `Owes ${fmt(card.owed)}`}
          </div>
          {card.shortfall > 0 ? (
            <div className={`text-small font-medium ${t.credit}`}>
              {fmt(card.shortfall)} not covered
            </div>
          ) : (
            card.owed > 0 && (
              <div className={`text-small ${t.ok}`}>
                <Icon name="check" /> Covered
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export function VariantA({
  cards,
  rows,
  state,
  currency,
  actions,
  nextMonthName,
  addGroupButton,
  realGroups,
  realHidden,
}: VariantProps) {
  const [paying, setPaying] = useState<string | null>(null);
  const fmt = (n: number) => formatMilliunits(n, currency);
  const { open, closed } = splitCards(cards);
  const payingCard = cards.find((c) => c.id === paying);

  return (
    <div className="space-y-200">
      <div className={`overflow-hidden rounded-lg border ${t.border} ${t.surface}`}>
        <TableHeader addGroupButton={addGroupButton} />

        <GroupHeading>
          <span>Credit Card Payments</span>
          <span title="System group: one row per on-budget card, can't be renamed or deleted" className={t.faint}>
            <Icon name="lock" label="System group" />
          </span>
        </GroupHeading>
        {open.map((card) => (
          <PaymentRow key={card.id} card={card} currency={currency} onPay={() => setPaying(card.id)} />
        ))}

        <GroupHeading>
          <span>Everyday</span>
          <MockDataTag />
        </GroupHeading>
        {rows.map((row) => (
          <div key={row.id} className={`${rowGrid} ${t.rowBorder}`}>
            <div className={`col-span-2 truncate sm:col-span-1 ${t.text}`}>
              <bdi>{row.name}</bdi>
            </div>
            <div className={`sm:text-right ${t.text}`}>
              <MobileLabel>Budgeted</MobileLabel>
              {fmt(row.budgeted)}
            </div>
            <div className={`sm:text-right ${t.text}`}>
              <MobileLabel>Activity</MobileLabel>
              {fmt(row.activity)}
            </div>
            <div className="col-span-2 flex items-baseline justify-between gap-2 sm:col-span-1 sm:block sm:text-right">
              <MobileLabel>Available</MobileLabel>
              <AvailablePill row={row} currency={currency} />
            </div>
          </div>
        ))}

        {realGroups}

        {closed.length > 0 && (
          <>
            <GroupHeading>
              <span>Hidden</span>
            </GroupHeading>
            {closed.map((card) => (
              <div key={card.id} className={`${rowGrid} ${t.rowBorder}`}>
                <div className={`col-span-2 flex min-w-0 items-center gap-1.5 sm:col-span-3 ${t.text}`}>
                  <span className="truncate">
                    <bdi>{card.name}</bdi>
                  </span>
                  <span className={`shrink-0 rounded px-1.5 text-small ${t.surfaceAlt} ${t.muted}`}>
                    Closed card
                  </span>
                  <button
                    type="button"
                    onClick={() => actions.releaseClosed(card.id)}
                    className={`ms-auto shrink-0 rounded px-2 py-0.5 text-small ${t.ghostBtn}`}
                  >
                    Move to Ready to Assign
                  </button>
                </div>
                <div className="col-span-2 flex justify-between sm:col-span-1 sm:block sm:text-right">
                  <MobileLabel>Available</MobileLabel>
                  <span className={`font-medium ${t.ok}`}>{fmt(card.available)}</span>
                </div>
              </div>
            ))}
          </>
        )}
        {realHidden}
      </div>

      <div className={`flex flex-wrap gap-x-4 gap-y-1 text-small ${t.muted}`}>
        <span className="inline-flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${t.cashBg}`} />
          Cash overspending: comes out of {nextMonthName}&rsquo;s Ready to Assign
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${t.creditBg}`} />
          Credit overspending: added to the card&rsquo;s debt, not covered by its Payment Category
        </span>
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

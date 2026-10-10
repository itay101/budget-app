"use client";

// PROTOTYPE (#145) — Variant A, "YNAB-style rows": modelled on YNAB's own
// budget screen. "Credit Card Payments" is a system category group, last in
// the list just above Hidden, whose
// header carries the group totals (Available labelled PAYMENT), and each card
// is an ordinary category row — just its name, an editable Budgeted amount,
// Activity, and an Available pill (green, grey at zero). Nothing about the
// card's balance is squeezed into the row; paying happens elsewhere (the card
// account). Spending rows use the same pills: red = cash overspending, amber
// = credit overspending. A closed card's Payment Category sits in Hidden.

import { formatMilliunits, milliunitsToNumber, numberToMilliunits } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";
import type { RowView } from "./model";
import { GroupHeading, MockDataTag, splitCards, TableHeader } from "./shared";
import { t } from "./tokens";
import type { VariantProps } from "./CreditCardsPrototype";

const rowGrid =
  "grid grid-cols-2 gap-x-3 gap-y-2 border-b px-200 py-3 text-body last:border-b-0 sm:grid-cols-[1fr_120px_120px_120px] sm:items-center sm:gap-2 sm:py-2";

const pillBase = "inline-block rounded-full px-2 py-0.5 font-medium";
const pill = {
  ok: `${pillBase} bg-success/15 text-[#1B7F55] dark:bg-[#4BCE97]/20 dark:text-[#4BCE97]`,
  zero: `${pillBase} bg-neutral-200 text-neutral-600 dark:bg-[#38414A] dark:text-[#9FADBC]`,
  cash: `${pillBase} text-neutral-0 ${t.cashBg} dark:text-[#1D2125]`,
  credit: `${pillBase} text-neutral-800 ${t.creditBg} dark:text-[#1D2125]`,
};

function MobileLabel({ children }: { children: string }) {
  return <div className={`text-small sm:hidden ${t.muted}`}>{children}</div>;
}

function AmountPill({ amount, currency }: { amount: number; currency: string }) {
  return (
    <span className={amount > 0 ? pill.ok : amount === 0 ? pill.zero : pill.cash}>
      {formatMilliunits(amount, currency)}
    </span>
  );
}

function OverspendPill({ row, currency }: { row: RowView; currency: string }) {
  const fmt = (n: number) => formatMilliunits(n, currency);
  if (row.available >= 0) return <AmountPill amount={row.available} currency={currency} />;
  const both = row.cashOverspend > 0 && row.creditOverspend > 0;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span
        className={row.cashOverspend > 0 ? pill.cash : pill.credit}
        title={`${fmt(-row.cashOverspend)} cash overspending, ${fmt(-row.creditOverspend)} credit overspending`}
      >
        {fmt(row.available)}
      </span>
      {both && (
        <span className={`text-small ${t.muted}`}>
          <span className={t.cash}>{fmt(-row.cashOverspend)} cash</span> ·{" "}
          <span className={t.credit}>{fmt(-row.creditOverspend)} card</span>
        </span>
      )}
    </span>
  );
}

function BudgetedInput({
  id,
  value,
  currency,
  onSave,
}: {
  id: string;
  value: number;
  currency: string;
  onSave: (id: string, amount: number) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const raw = new FormData(e.currentTarget).get("amount");
        onSave(id, numberToMilliunits(Number(raw) || 0));
      }}
      className="col-span-2 sm:col-span-1 sm:flex sm:items-center sm:justify-end"
    >
      <MobileLabel>Budgeted</MobileLabel>
      <div className="flex items-center gap-1">
        <MoneyInput
          key={value}
          name="amount"
          currency={currency}
          defaultValue={milliunitsToNumber(value)}
          className={`w-full text-right sm:w-24 ${t.input}`}
        />
        <button type="submit" title="Save" className={`rounded px-1.5 py-1 text-small ${t.brand} ${t.hover}`}>
          <Icon name="check" label="Save" />
        </button>
      </div>
    </form>
  );
}

export function VariantA({
  cards,
  rows,
  currency,
  actions,
  nextMonthName,
  addGroupButton,
  realGroups,
  realHidden,
}: VariantProps) {
  const fmt = (n: number) => formatMilliunits(n, currency);
  const { open, closed } = splitCards(cards);
  const sum = (f: (c: (typeof open)[number]) => number) => open.reduce((a, c) => a + f(c), 0);

  return (
    <div className="space-y-200">
      <div className={`overflow-hidden rounded-lg border ${t.border} ${t.surface}`}>
        <TableHeader addGroupButton={addGroupButton} />

        <GroupHeading>
          <span>Everyday</span>
          <MockDataTag />
        </GroupHeading>
        {rows.map((row) => (
          <div key={row.id} className={`${rowGrid} ${t.rowBorder}`}>
            <div className={`col-span-2 truncate sm:col-span-1 ${t.text}`}>
              <bdi>{row.name}</bdi>
            </div>
            <BudgetedInput id={row.id} value={row.budgeted} currency={currency} onSave={actions.setBudgeted} />
            <div className={`sm:text-right ${t.text}`}>
              <MobileLabel>Activity</MobileLabel>
              {fmt(row.activity)}
            </div>
            <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
              <MobileLabel>Available</MobileLabel>
              <OverspendPill row={row} currency={currency} />
            </div>
          </div>
        ))}

        {realGroups}

        <div
          className={`grid grid-cols-[1fr_auto] items-center gap-2 border-b px-200 py-1.5 sm:grid-cols-[1fr_120px_120px_120px] ${t.border} bg-neutral-200/60 dark:bg-[#2C333A]`}
        >
          <div className={`flex items-center gap-2 text-body font-semibold ${t.text}`}>
            <Icon name="credit_card" className={t.muted} />
            <span>Credit Card Payments</span>
            <span title="System group: a card's Payment Category is added when the card goes on-budget" className={t.faint}>
              <Icon name="lock" label="System group" />
            </span>
          </div>
          <div className={`hidden text-right text-body sm:block ${t.text}`}>{fmt(sum((c) => c.budgeted))}</div>
          <div className={`hidden text-right text-body sm:block ${t.text}`}>{fmt(sum((c) => c.activity))}</div>
          <div className="text-right">
            <div className={`text-[10px] font-semibold uppercase tracking-wide ${t.muted}`}>
              <span title="Money set aside to pay your cards">Payment</span>
            </div>
            <div className={`text-body ${t.text}`}>{fmt(sum((c) => c.available))}</div>
          </div>
        </div>
        {open.map((card) => (
          <div
            key={card.id}
            className={`${rowGrid} ${t.rowBorder}`}
            title={`${card.owed < 0 ? "Card in credit" : "Card balance owed"}: ${fmt(Math.abs(card.owed))}`}
          >
            <div className={`col-span-2 truncate sm:col-span-1 ${t.text}`}>
              <bdi>{card.name}</bdi>
            </div>
            <BudgetedInput id={card.id} value={card.budgeted} currency={currency} onSave={actions.setBudgeted} />
            <div className={`sm:text-right ${t.text}`}>
              <MobileLabel>Activity</MobileLabel>
              {fmt(card.activity)}
            </div>
            <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
              <MobileLabel>Available</MobileLabel>
              <AmountPill amount={card.available} currency={currency} />
            </div>
          </div>
        ))}


        {closed.length > 0 && (
          <>
            <GroupHeading>
              <span>Hidden</span>
            </GroupHeading>
            {closed.map((card) => (
              <div key={card.id} className={`${rowGrid} ${t.rowBorder}`}>
                <div className={`col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 sm:col-span-3 ${t.text}`}>
                  <span className="shrink-0">
                    <bdi>{card.name}</bdi>
                  </span>
                  <span className={`min-w-0 truncate text-small ${t.faint}`}>— Credit Card Payments · closed</span>
                  <button
                    type="button"
                    onClick={() => actions.releaseClosed(card.id)}
                    className={`shrink-0 rounded px-2 py-0.5 text-small sm:ms-auto ${t.ghostBtn}`}
                  >
                    Move to Ready to Assign
                  </button>
                </div>
                <div className="col-span-2 flex justify-between sm:col-span-1 sm:block sm:text-right">
                  <MobileLabel>Available</MobileLabel>
                  <AmountPill amount={card.available} currency={currency} />
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
    </div>
  );
}

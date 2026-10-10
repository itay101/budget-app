"use client";

// PROTOTYPE (#145) — Variant C, "Inspector": the table stays as quiet as
// today's, with only an icon + colour on Available (wallet = cash, card =
// credit, purple for credit instead of amber). Clicking any row opens a side
// drawer (bottom sheet on mobile) that walks through the cash-first maths in
// words; for a Payment Category the drawer holds the card balance and the pay
// form itself. A closed card's leftover money is a banner, not a row.

import { useState } from "react";
import { formatMilliunits } from "@/lib/money";
import { Icon } from "@/components/Icon";
import type { CardView, RowView } from "./model";
import { CardAmounts, Name, PayCardForm, GroupHeading, MockDataTag, splitCards, TableHeader } from "./shared";
import { t } from "./tokens";
import type { VariantProps } from "./CreditCardsPrototype";

type Selected = { kind: "card"; id: string } | { kind: "row"; id: string } | null;

const rowGrid =
  "grid w-full grid-cols-[1fr_auto] items-center gap-2 border-b px-200 py-2.5 text-left text-body sm:grid-cols-[1fr_120px_120px_120px]";

function AvailableCell({ row, currency }: { row: RowView; currency: string }) {
  const fmt = (n: number) => formatMilliunits(n, currency);
  if (row.available >= 0) return <span className={`font-medium ${t.ok}`}>{fmt(row.available)}</span>;
  const tone = row.cashOverspend > 0 ? t.cash : t.creditAlt;
  return (
    <span className={`inline-flex items-center justify-end gap-1 font-medium ${tone}`}>
      {row.cashOverspend > 0 && <Icon name="account_balance_wallet" label="Cash overspending" />}
      {row.creditOverspend > 0 && (
        <Icon name="credit_card" label="Credit overspending" className={t.creditAlt} />
      )}
      {fmt(row.available)}
    </span>
  );
}

function RowExplainer({
  row,
  cards,
  currency,
  nextMonthName,
}: {
  row: RowView;
  cards: CardView[];
  currency: string;
  nextMonthName: string;
}) {
  const fmt = (n: number) => formatMilliunits(n, currency);
  const cashLeft = row.budgeted - row.cashSpending;
  const line = (label: React.ReactNode, value: number, tone = t.text) => (
    <div className="flex justify-between gap-2">
      <span className={t.muted}>{label}</span>
      <span className={tone}>{fmt(value)}</span>
    </div>
  );
  return (
    <div className="space-y-3 text-body">
      <div className="space-y-1">
        {line("Budgeted", row.budgeted)}
        {line("Cash spending", -row.cashSpending)}
        {line("Left after cash", cashLeft, cashLeft < 0 ? t.cash : t.text)}
        {line("Card spending", -row.cardTotal)}
      </div>
      <ol className={`list-decimal space-y-1 ps-5 ${t.text}`}>
        <li>Cash spending is covered first.</li>
        {row.cardTotal > 0 && (
          <li>
            {fmt(row.funded)} of card spending was covered and moved to the
            card{row.cardSpending.length > 1 ? "s’" : "’s"} Payment Category
            {row.cardSpending.length > 1 && (
              <>
                {" "}(<CardAmounts cards={cards} amounts={row.fundedByCard} currency={currency} />)
              </>
            )}
            .
          </li>
        )}
      </ol>
      {row.cashOverspend > 0 && (
        <div className={`rounded px-2 py-1.5 ${t.cashTint}`}>
          <div className={`flex items-center gap-1 font-medium ${t.cash}`}>
            <Icon name="account_balance_wallet" /> {fmt(row.cashOverspend)} cash overspending
          </div>
          <p className={`text-small ${t.text}`}>
            Comes out of {nextMonthName}&rsquo;s Ready to Assign unless you move
            money here before the month ends.
          </p>
        </div>
      )}
      {row.creditOverspend > 0 && (
        <div className={`rounded px-2 py-1.5 ${t.creditAltTint}`}>
          <div className={`flex items-center gap-1 font-medium ${t.creditAlt}`}>
            <Icon name="credit_card" /> {fmt(row.creditOverspend)} credit overspending
          </div>
          <p className={`text-small ${t.text}`}>
            Now debt on{" "}
            <CardAmounts
              cards={cards}
              amounts={row.creditByCard}
              currency={currency}
              showAmounts={row.cardSpending.length > 1}
            />
            . It doesn&rsquo;t touch Ready to Assign; move money here to set it aside for the payment.
          </p>
        </div>
      )}
    </div>
  );
}

function CardInspector({
  card,
  currency,
  state,
  onPay,
}: {
  card: CardView;
  currency: string;
  state: VariantProps["state"];
  onPay: VariantProps["actions"]["pay"];
}) {
  const fmt = (n: number) => formatMilliunits(n, currency);
  return (
    <div className="space-y-3 text-body">
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded p-2 ${t.surfaceAlt}`}>
          <div className={`text-small ${t.muted}`}>Card balance</div>
          <div className={`text-h3 ${t.text}`}>{fmt(-card.owed)}</div>
        </div>
        <div className={`rounded p-2 ${t.surfaceAlt}`}>
          <div className={`text-small ${t.muted}`}>Available for payment</div>
          <div className={`text-h3 ${card.available < 0 ? t.cash : t.ok}`}>{fmt(card.available)}</div>
        </div>
      </div>
      {card.shortfall > 0 && (
        <p className={`rounded px-2 py-1.5 text-small ${t.creditAltTint} ${t.text}`}>
          <span className={`font-medium ${t.creditAlt}`}>{fmt(card.shortfall)} more owed than set aside.</span>{" "}
          Move money into this category to pay the full balance.
        </p>
      )}
      <h3 className={`text-small font-semibold uppercase tracking-wide ${t.muted}`}>Pay this card</h3>
      <PayCardForm key={card.id + card.payments} card={card} cashAccounts={state.cashAccounts} currency={currency} onPay={onPay} />
      <a href="#" className={`inline-flex items-center gap-1 text-small ${t.brand}`}>
        Open <Name>{card.name}</Name> account <Icon name="arrow_forward" />
      </a>
    </div>
  );
}

export function VariantC({
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
  const [selected, setSelected] = useState<Selected>(null);
  const fmt = (n: number) => formatMilliunits(n, currency);
  const { open, closed } = splitCards(cards);
  const selCard = selected?.kind === "card" ? cards.find((c) => c.id === selected.id) : undefined;
  const selRow = selected?.kind === "row" ? rows.find((r) => r.id === selected.id) : undefined;

  return (
    <div className="space-y-200">
      {closed.map((card) => (
        <div
          key={card.id}
          className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-body ${t.border} ${t.surface} ${t.text}`}
        >
          <Icon name="info" className={t.brand} />
          <span className="min-w-0 flex-1">
            Closed card <Name>{card.name}</Name> still has {fmt(card.available)} in
            its hidden Payment Category.
          </span>
          <button
            type="button"
            onClick={() => actions.releaseClosed(card.id)}
            className={`rounded px-2 py-0.5 text-small ${t.ghostBtn}`}
          >
            Move to Ready to Assign
          </button>
        </div>
      ))}

      <div className={`overflow-hidden rounded-lg border ${t.border} ${t.surface}`}>
        <TableHeader addGroupButton={addGroupButton} alwaysShowAvailable />

        <GroupHeading>
          <span>Everyday</span>
          <MockDataTag />
        </GroupHeading>
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setSelected({ kind: "row", id: row.id })}
            className={`${rowGrid} ${t.rowBorder} ${t.hover} ${selected?.id === row.id ? t.surfaceAlt : ""}`}
          >
            <span className={`truncate ${t.text}`}>
              <bdi>{row.name}</bdi>
            </span>
            <span className={`hidden text-right sm:block ${t.text}`}>{fmt(row.budgeted)}</span>
            <span className={`hidden text-right sm:block ${t.text}`}>{fmt(row.activity)}</span>
            <span className="text-right">
              <AvailableCell row={row} currency={currency} />
            </span>
          </button>
        ))}
        {realGroups}

        <GroupHeading>
          Credit Card Payments
        </GroupHeading>
        {open.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setSelected({ kind: "card", id: card.id })}
            className={`${rowGrid} ${t.rowBorder} ${t.hover} ${selected?.id === card.id ? t.surfaceAlt : ""}`}
          >
            <span className={`flex min-w-0 items-center gap-1.5 ${t.text}`}>
              <span className="truncate">
                <bdi>{card.name}</bdi>
              </span>
              {card.shortfall > 0 && (
                <span title={`${fmt(card.shortfall)} more owed than set aside`}>
                  <Icon name="error" className={t.creditAlt} label="Owes more than set aside" />
                </span>
              )}
            </span>
            <span className={`hidden text-right sm:block ${t.text}`}>{fmt(card.budgeted)}</span>
            <span className={`hidden text-right sm:block ${t.text}`}>{fmt(card.activity)}</span>
            <span className={`text-right font-medium ${card.available < 0 ? t.cash : t.ok}`}>
              {fmt(card.available)}
            </span>
          </button>
        ))}
        {realHidden}
      </div>

      {(selCard || selRow) && (
        <div className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent" onClick={() => setSelected(null)}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className={`fixed inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-lg border p-4 pb-20 shadow-xl sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-0 sm:max-h-none sm:w-96 sm:rounded-none ${t.border} ${t.surface}`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className={`truncate text-h3 ${t.text}`} >
                <bdi>{selCard?.name ?? selRow?.name}</bdi>
              </h2>
              <button type="button" onClick={() => setSelected(null)} className={`rounded p-1 ${t.muted} ${t.hover}`}>
                <Icon name="close" label="Close" />
              </button>
            </div>
            {selCard && <CardInspector card={selCard} currency={currency} state={state} onPay={actions.pay} />}
            {selRow && <RowExplainer row={selRow} cards={cards} currency={currency} nextMonthName={nextMonthName} />}
          </aside>
        </div>
      )}
    </div>
  );
}

"use client";

// PROTOTYPE (#145): small pieces shared by the variants — the stubbed "pay
// the card" form (a Transfer from a cash account, in memory only) and a
// modal wrapper for it.

import { useState } from "react";
import { formatMilliunits, numberToMilliunits } from "@/lib/money";
import { Icon } from "@/components/Icon";
import type { CardView, CashAccount } from "./model";
import { t } from "./tokens";

export type ProtoActions = {
  pay: (cardId: string, fromAccountId: string, amount: number) => void;
  releaseClosed: (cardId: string) => void;
  setBudgeted: (id: string, amount: number) => void;
};

/** A user-supplied name inside LTR copy: isolate it so Hebrew doesn't reorder the sentence. */
export function Name({ children }: { children: string }) {
  return <bdi>{children}</bdi>;
}

export function PayCardForm({
  card,
  cashAccounts,
  currency,
  onPay,
  onDone,
}: {
  card: CardView;
  cashAccounts: CashAccount[];
  currency: string;
  onPay: ProtoActions["pay"];
  onDone?: () => void;
}) {
  const suggested = Math.max(0, Math.min(card.available, card.owed));
  const [fromId, setFromId] = useState(cashAccounts[0].id);
  const [amount, setAmount] = useState((suggested / 1000).toFixed(2));
  const milli = numberToMilliunits(Number(amount) || 0);
  const overBy = milli - Math.max(card.available, 0);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (milli <= 0) return;
        onPay(card.id, fromId, milli);
        onDone?.();
      }}
    >
      <label className="block">
        <span className={`mb-1 block text-small ${t.muted}`}>From</span>
        <select
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className={`w-full ${t.input}`}
          dir="auto"
        >
          {cashAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {formatMilliunits(a.balance, currency)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={`mb-1 block text-small ${t.muted}`}>Amount</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`no-spinner w-full text-right ${t.input}`}
        />
      </label>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setAmount((Math.max(card.available, 0) / 1000).toFixed(2))}
          className={`rounded-full px-2 py-0.5 text-small ${t.ghostBtn}`}
        >
          Set aside {formatMilliunits(Math.max(card.available, 0), currency)}
        </button>
        <button
          type="button"
          onClick={() => setAmount((Math.max(card.owed, 0) / 1000).toFixed(2))}
          className={`rounded-full px-2 py-0.5 text-small ${t.ghostBtn}`}
        >
          Full balance {formatMilliunits(Math.max(card.owed, 0), currency)}
        </button>
      </div>
      {overBy > 0 && (
        <p className={`rounded px-2 py-1 text-small ${t.cashTint} ${t.cash}`}>
          That&rsquo;s {formatMilliunits(overBy, currency)} more than the
          Payment Category holds. It goes negative, and that comes out of next
          month&rsquo;s Ready to Assign unless you move money in.
        </p>
      )}
      <p className={`text-small ${t.muted}`}>
        Records a Transfer to <Name>{card.name}</Name>. It spends from the
        Payment Category, not from any spending category.
      </p>
      <button
        type="submit"
        disabled={milli <= 0}
        className={`w-full rounded px-3 py-1.5 text-body font-medium disabled:opacity-50 ${t.brandBtn}`}
      >
        Record payment
      </button>
    </form>
  );
}

export function PayCardDialog({
  card,
  cashAccounts,
  currency,
  onPay,
  onClose,
}: {
  card: CardView;
  cashAccounts: CashAccount[];
  currency: string;
  onPay: ProtoActions["pay"];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Pay ${card.name}`}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-t-lg border p-4 pb-20 shadow-lg sm:rounded-lg sm:pb-4 ${t.surface} ${t.border}`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className={`truncate text-h3 ${t.text}`}>
            Pay <Name>{card.name}</Name>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`rounded p-1 ${t.muted} ${t.hover}`}
          >
            <Icon name="close" label="Close" />
          </button>
        </div>
        <PayCardForm
          card={card}
          cashAccounts={cashAccounts}
          currency={currency}
          onPay={onPay}
          onDone={onClose}
        />
      </div>
    </div>
  );
}

export function splitCards(cards: CardView[]) {
  return {
    open: cards.filter((c) => !c.closed),
    closed: cards.filter((c) => c.closed && c.available > 0),
  };
}

/** The budget table's column header, as on the real page. */
export function TableHeader({
  addGroupButton,
  alwaysShowAvailable = false,
}: {
  addGroupButton: React.ReactNode;
  alwaysShowAvailable?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 border-b px-200 py-2 text-small font-medium uppercase tracking-wide sm:grid sm:grid-cols-[1fr_120px_120px_120px] ${t.border} ${t.surfaceAlt} ${t.muted}`}
    >
      <div className="flex items-center gap-2">
        <span>Category</span>
        {addGroupButton}
      </div>
      <div className="hidden text-right sm:block">Budgeted</div>
      <div className="hidden text-right sm:block">Activity</div>
      <div className={alwaysShowAvailable ? "text-right" : "hidden text-right sm:block"}>Available</div>
    </div>
  );
}

export function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`flex items-center gap-2 px-200 py-1.5 text-small font-semibold uppercase tracking-wide ${t.surfaceAlt} ${t.muted}`}
    >
      {children}
    </div>
  );
}

export function MockDataTag() {
  return (
    <span className="rounded bg-discovery/15 px-1.5 text-[10px] normal-case tracking-normal text-discovery">
      prototype data
    </span>
  );
}

/** "Card A $1.00, Card B $2.00" for a row's per-card split. */
export function CardAmounts({
  cards,
  amounts,
  currency,
  showAmounts = true,
}: {
  cards: CardView[];
  amounts: Record<string, number>;
  currency: string;
  showAmounts?: boolean;
}) {
  const ids = Object.keys(amounts).filter((id) => amounts[id] > 0);
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <Name>{cards.find((k) => k.id === id)!.name}</Name>
          {showAmounts && ` ${formatMilliunits(amounts[id], currency)}`}
        </span>
      ))}
    </>
  );
}

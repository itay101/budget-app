"use client";

import { useState, useTransition } from "react";
import { milliunitsToNumber } from "@/lib/money";
import { MoneyInput } from "@/components/MoneyInput";
import { Icon } from "@/components/Icon";

type CategoryOption = { id: string; name: string };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

type TransactionRowData = {
  id: string;
  date: string; // ISO string
  payeeName: string;
  categoryId: string;
  memo: string;
  amount: number; // milliunits
  accountName?: string;
};

type Draft = {
  date: string;
  payeeName: string;
  categoryId: string;
  memo: string;
  inflow: string;
  outflow: string;
};

function draftFrom(t: TransactionRowData): Draft {
  return {
    date: t.date.slice(0, 10),
    payeeName: t.payeeName,
    categoryId: t.categoryId,
    memo: t.memo,
    inflow: t.amount > 0 ? String(milliunitsToNumber(t.amount)) : "",
    outflow: t.amount < 0 ? String(milliunitsToNumber(-t.amount)) : "",
  };
}

const inputClass =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-body hover:border-neutral-200 focus:border-brand-700 focus:bg-neutral-0 focus:outline-none focus:ring-1 focus:ring-brand-700";

const GRID_COLS_WITH_ACCOUNT =
  "md:grid-cols-[130px_110px_1fr_1fr_1fr_100px_100px_150px]";
const GRID_COLS = "md:grid-cols-[130px_1fr_1fr_1fr_100px_100px_150px]";

export function TransactionsTable({
  transactions,
  categoryGroups,
  payeeNames,
  updateTransaction,
  deleteTransaction,
  showAccount = false,
  currency = "USD",
}: {
  transactions: TransactionRowData[];
  categoryGroups: GroupOption[];
  payeeNames: string[];
  updateTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (formData: FormData) => Promise<void>;
  showAccount?: boolean;
  currency?: string;
}) {
  const gridCols = showAccount ? GRID_COLS_WITH_ACCOUNT : GRID_COLS;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
      <datalist id="payee-suggestions">
        {payeeNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div
        className={`hidden gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600 md:grid ${gridCols}`}
      >
        <div>Date</div>
        {showAccount && <div>Account</div>}
        <div>Payee</div>
        <div>Category</div>
        <div>Memo</div>
        <div className="text-right">Inflow</div>
        <div className="text-right">Outflow</div>
        <div />
      </div>

      {transactions.map((t) => (
        <TransactionRow
          key={t.id}
          transaction={t}
          categoryGroups={categoryGroups}
          updateTransaction={updateTransaction}
          deleteTransaction={deleteTransaction}
          showAccount={showAccount}
          gridCols={gridCols}
          currency={currency}
        />
      ))}

      {transactions.length === 0 && (
        <div className="px-200 py-300 text-body text-neutral-600">
          No transactions yet.
        </div>
      )}
    </div>
  );
}

function TransactionRow({
  transaction,
  categoryGroups,
  updateTransaction,
  deleteTransaction,
  showAccount,
  gridCols,
  currency,
}: {
  transaction: TransactionRowData;
  categoryGroups: GroupOption[];
  updateTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (formData: FormData) => Promise<void>;
  showAccount: boolean;
  gridCols: string;
  currency: string;
}) {
  const [pending, startTransition] = useTransition();

  // `committed` tracks the last-saved state (what Cancel reverts to);
  // `draft` is what's currently in the inputs. Editing only ever touches
  // `draft` - nothing is sent to the server until Submit.
  const [committed, setCommitted] = useState(() => draftFrom(transaction));
  const [draft, setDraft] = useState(committed);

  const isDirty =
    draft.date !== committed.date ||
    draft.payeeName !== committed.payeeName ||
    draft.categoryId !== committed.categoryId ||
    draft.memo !== committed.memo ||
    draft.inflow !== committed.inflow ||
    draft.outflow !== committed.outflow;

  function patch(fields: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...fields }));
  }

  function handleCancel() {
    setDraft(committed);
  }

  function handleSubmit() {
    const inflowValue = Number(draft.inflow) || 0;
    const outflowValue = Number(draft.outflow) || 0;
    const amount = inflowValue > 0 ? inflowValue : outflowValue ? -outflowValue : 0;

    const formData = new FormData();
    formData.set("transactionId", transaction.id);
    formData.set("date", draft.date);
    formData.set("payeeName", draft.payeeName);
    formData.set("categoryId", draft.categoryId);
    formData.set("memo", draft.memo);
    formData.set("amount", String(amount));

    startTransition(async () => {
      await updateTransaction(formData);
      setCommitted(draft);
    });
  }

  function handleDelete() {
    if (!window.confirm("Delete this transaction? This can't be undone.")) {
      return;
    }
    const formData = new FormData();
    formData.set("transactionId", transaction.id);
    startTransition(async () => {
      await deleteTransaction(formData);
    });
  }

  return (
    <div
      className={
        `grid grid-cols-2 gap-x-3 gap-y-2 border-b border-neutral-100 px-200 py-3 text-body last:border-b-0 md:items-center md:gap-2 md:py-1 ${gridCols} ` +
        (isDirty ? "bg-brand-700/5" : "")
      }
    >
      <div className="col-span-2 md:col-span-1">
        <label className="mb-1 block text-small text-neutral-600 md:hidden">
          Date
        </label>
        <input
          type="date"
          value={draft.date}
          onChange={(e) => patch({ date: e.target.value })}
          className={inputClass}
        />
      </div>

      {showAccount && (
        <div className="col-span-2 truncate text-neutral-600 md:col-span-1 md:px-1">
          <span className="mr-1 text-small md:hidden">Account:</span>
          {transaction.accountName}
        </div>
      )}

      <div className="col-span-2 md:col-span-1">
        <label className="mb-1 block text-small text-neutral-600 md:hidden">
          Payee
        </label>
        <input
          type="text"
          value={draft.payeeName}
          list="payee-suggestions"
          placeholder="Payee"
          onChange={(e) => patch({ payeeName: e.target.value })}
          className={inputClass}
        />
      </div>

      <div className="col-span-2 md:col-span-1">
        <label className="mb-1 block text-small text-neutral-600 md:hidden">
          Category
        </label>
        <select
          value={draft.categoryId}
          onChange={(e) => patch({ categoryId: e.target.value })}
          className={inputClass}
        >
          <option value="">Uncategorized</option>
          {categoryGroups.map((group) => (
            <optgroup key={group.id} label={group.name}>
              {group.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="col-span-2 md:col-span-1">
        <label className="mb-1 block text-small text-neutral-600 md:hidden">
          Memo
        </label>
        <input
          type="text"
          value={draft.memo}
          placeholder="Memo"
          onChange={(e) => patch({ memo: e.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-small text-neutral-600 md:hidden">
          Inflow
        </label>
        <MoneyInput
          currency={currency}
          value={draft.inflow}
          placeholder="0.00"
          onChange={(e) => patch({ inflow: e.target.value, outflow: "" })}
          className={inputClass + " text-right text-success"}
        />
      </div>

      <div>
        <label className="mb-1 block text-small text-neutral-600 md:hidden">
          Outflow
        </label>
        <MoneyInput
          currency={currency}
          value={draft.outflow}
          placeholder="0.00"
          onChange={(e) => patch({ outflow: e.target.value, inflow: "" })}
          className={inputClass + " text-right text-danger"}
        />
      </div>

      <div className="col-span-2 flex justify-end gap-1 md:col-span-1">
        {isDirty && (
          <>
            <button
              type="button"
              onClick={handleCancel}
              disabled={pending}
              title="Cancel"
              className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
            >
              <Icon name="close" label="Cancel" />
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              title="Save"
              className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {pending ? "…" : <Icon name="check" label="Save" />}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          title="Delete transaction"
          className="rounded p-1 text-neutral-400 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        >
          <Icon name="delete" label="Delete transaction" />
        </button>
      </div>
    </div>
  );
}

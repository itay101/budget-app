"use client";

import { useState, useTransition } from "react";
import { milliunitsToNumber } from "@/lib/money";

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

const inputClass =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-body hover:border-neutral-200 focus:border-brand-700 focus:bg-neutral-0 focus:outline-none focus:ring-1 focus:ring-brand-700";

const GRID_COLS_WITH_ACCOUNT =
  "grid-cols-[130px_110px_1fr_1fr_1fr_100px_100px]";
const GRID_COLS = "grid-cols-[130px_1fr_1fr_1fr_100px_100px]";

export function TransactionsTable({
  transactions,
  categoryGroups,
  payeeNames,
  updateTransaction,
  showAccount = false,
}: {
  transactions: TransactionRowData[];
  categoryGroups: GroupOption[];
  payeeNames: string[];
  updateTransaction: (formData: FormData) => Promise<void>;
  showAccount?: boolean;
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
        className={`grid ${gridCols} gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600`}
      >
        <div>Date</div>
        {showAccount && <div>Account</div>}
        <div>Payee</div>
        <div>Category</div>
        <div>Memo</div>
        <div className="text-right">Inflow</div>
        <div className="text-right">Outflow</div>
      </div>

      {transactions.map((t) => (
        <TransactionRow
          key={t.id}
          transaction={t}
          categoryGroups={categoryGroups}
          updateTransaction={updateTransaction}
          showAccount={showAccount}
          gridCols={gridCols}
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
  showAccount,
  gridCols,
}: {
  transaction: TransactionRowData;
  categoryGroups: GroupOption[];
  updateTransaction: (formData: FormData) => Promise<void>;
  showAccount: boolean;
  gridCols: string;
}) {
  const [, startTransition] = useTransition();

  const [date, setDate] = useState(transaction.date.slice(0, 10));
  const [payeeName, setPayeeName] = useState(transaction.payeeName);
  const [categoryId, setCategoryId] = useState(transaction.categoryId);
  const [memo, setMemo] = useState(transaction.memo);
  const [inflow, setInflow] = useState(
    transaction.amount > 0 ? String(milliunitsToNumber(transaction.amount)) : "",
  );
  const [outflow, setOutflow] = useState(
    transaction.amount < 0
      ? String(milliunitsToNumber(-transaction.amount))
      : "",
  );

  function commit(field: string, value: string) {
    const formData = new FormData();
    formData.set("transactionId", transaction.id);
    formData.set(field, value);
    startTransition(async () => {
      await updateTransaction(formData);
    });
  }

  return (
    <div
      className={`grid ${gridCols} items-center gap-2 border-b border-neutral-100 px-200 py-1 text-body last:border-b-0`}
    >
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        onBlur={() => commit("date", date)}
        className={inputClass}
      />

      {showAccount && (
        <div className="truncate px-1 text-neutral-600">
          {transaction.accountName}
        </div>
      )}

      <input
        type="text"
        value={payeeName}
        list="payee-suggestions"
        placeholder="Payee"
        onChange={(e) => setPayeeName(e.target.value)}
        onBlur={() => commit("payeeName", payeeName)}
        className={inputClass}
      />

      <select
        value={categoryId}
        onChange={(e) => {
          setCategoryId(e.target.value);
          commit("categoryId", e.target.value);
        }}
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

      <input
        type="text"
        value={memo}
        placeholder="Memo"
        onChange={(e) => setMemo(e.target.value)}
        onBlur={() => commit("memo", memo)}
        className={inputClass}
      />

      <input
        type="number"
        step="0.01"
        value={inflow}
        placeholder="0.00"
        onChange={(e) => {
          // Clear the other side immediately, not on blur - otherwise
          // typing into Inflow then clicking straight into Outflow (before
          // Inflow's blur fires) briefly shows both as nonzero at once.
          setInflow(e.target.value);
          setOutflow("");
        }}
        onBlur={() => commit("amount", inflow || "0")}
        className={inputClass + " text-right text-success"}
      />

      <input
        type="number"
        step="0.01"
        value={outflow}
        placeholder="0.00"
        onChange={(e) => {
          setOutflow(e.target.value);
          setInflow("");
        }}
        onBlur={() => {
          const value = Number(outflow) || 0;
          commit("amount", value ? String(-value) : "0");
        }}
        className={inputClass + " text-right text-danger"}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatMilliunits } from "@/lib/money";
import { ACCOUNT_TYPE_OPTIONS } from "@/lib/accountTypes";

type AccountRowData = {
  id: string;
  name: string;
  type: string;
  onBudget: boolean;
  closed: boolean;
  balance: number;
};

const inputClass =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-body hover:border-neutral-200 focus:border-brand-700 focus:bg-neutral-0 focus:outline-none focus:ring-1 focus:ring-brand-700";

const GRID_COLS = "grid-cols-[1fr_160px_90px_90px_120px]";

export function AccountsTable({
  accounts,
  currency,
  updateAccount,
}: {
  accounts: AccountRowData[];
  currency: string;
  updateAccount: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
      <div
        className={`grid ${GRID_COLS} gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600`}
      >
        <div>Name</div>
        <div>Type</div>
        <div className="text-center">On budget</div>
        <div className="text-center">Closed</div>
        <div className="text-right">Balance</div>
      </div>

      {accounts.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          currency={currency}
          updateAccount={updateAccount}
        />
      ))}

      {accounts.length === 0 && (
        <div className="px-200 py-300 text-body text-neutral-600">
          No accounts yet.
        </div>
      )}
    </div>
  );
}

function AccountRow({
  account,
  currency,
  updateAccount,
}: {
  account: AccountRowData;
  currency: string;
  updateAccount: (formData: FormData) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);

  function commit(field: string, value: string) {
    const formData = new FormData();
    formData.set("accountId", account.id);
    formData.set(field, value);
    startTransition(async () => {
      await updateAccount(formData);
    });
  }

  return (
    <div
      className={`grid ${GRID_COLS} items-center gap-2 border-b border-neutral-100 px-200 py-1 text-body last:border-b-0 ${account.closed ? "opacity-60" : ""}`}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => commit("name", name)}
        className={inputClass}
      />

      <select
        value={type}
        onChange={(e) => {
          setType(e.target.value);
          commit("type", e.target.value);
        }}
        className={inputClass}
      >
        {ACCOUNT_TYPE_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <div className="flex justify-center">
        <input
          type="checkbox"
          defaultChecked={account.onBudget}
          onChange={(e) => commit("onBudget", String(e.target.checked))}
          className="h-4 w-4 rounded border-neutral-200 text-brand-700 focus:ring-1 focus:ring-brand-700"
        />
      </div>

      <div className="flex justify-center">
        <input
          type="checkbox"
          defaultChecked={account.closed}
          onChange={(e) => commit("closed", String(e.target.checked))}
          className="h-4 w-4 rounded border-neutral-200 text-brand-700 focus:ring-1 focus:ring-brand-700"
        />
      </div>

      <Link
        href={`/accounts/${account.id}`}
        className={
          "text-right font-medium hover:underline " +
          (account.balance < 0 ? "text-danger" : "text-neutral-800")
        }
      >
        {formatMilliunits(account.balance, currency)}
      </Link>
    </div>
  );
}

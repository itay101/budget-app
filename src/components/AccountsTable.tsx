"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMilliunits } from "@/lib/money";
import { ACCOUNT_TYPE_LOCKED_MESSAGE, ACCOUNT_TYPE_OPTIONS } from "@/lib/accountTypes";
import { useServerAction } from "@/components/useServerAction";
import { ON_BUDGET_LOCKED_MESSAGE } from "@/lib/transfers";

type AccountRowData = {
  id: string;
  name: string;
  type: string;
  onBudget: boolean;
  closed: boolean;
  balance: number;
  hasTransactions: boolean;
};

const inputClass =
  "w-full rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-body hover:border-neutral-200 focus:border-brand-700 focus:bg-neutral-0 focus:outline-hidden focus:ring-1 focus:ring-brand-700";

const GRID_COLS = "md:grid-cols-[1fr_160px_90px_90px_120px]";

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
        className={`hidden gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600 md:grid ${GRID_COLS}`}
      >
        <div>Name</div>
        <div>Type</div>
        <div className="text-center">On budget</div>
        <div className="text-center">Closed</div>
        <div className="text-right">Balance</div>
      </div>

      {accounts.some((account) => account.hasTransactions) && (
        <p
          id="on-budget-lock-note"
          className="border-b border-neutral-100 px-200 py-2 text-small text-neutral-600"
        >
          {ON_BUDGET_LOCKED_MESSAGE}
        </p>
      )}

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

function AccountTypeSelect({
  type,
  locked,
  onChange,
}: {
  type: string;
  locked: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="col-span-2 md:col-span-1">
      <label className="mb-1 block text-small text-neutral-600 md:hidden">Type</label>
      <select
        value={type}
        disabled={locked}
        title={locked ? ACCOUNT_TYPE_LOCKED_MESSAGE : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        {ACCOUNT_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function OnBudgetCheckbox({
  checked,
  locked,
  onChange,
}: {
  checked: boolean;
  locked: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 md:justify-center">
      <input
        type="checkbox"
        aria-label="On budget"
        defaultChecked={checked}
        disabled={locked}
        title={locked ? ON_BUDGET_LOCKED_MESSAGE : undefined}
        aria-describedby={locked ? "on-budget-lock-note" : undefined}
        onChange={(event) => onChange(String(event.target.checked))}
        className="h-4 w-4 rounded-sm border-neutral-200 text-brand-700 focus:ring-1 focus:ring-brand-700 disabled:cursor-not-allowed"
      />
      <span className="text-small text-neutral-600 md:hidden">On budget</span>
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
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const { run, error } = useServerAction(updateAccount);

  function commit(field: string, value: string) {
    run({ accountId: account.id, [field]: value }).catch(() => {
      // error is surfaced via `error`
    });
  }

  return (
    <div
      className={`grid grid-cols-2 items-start gap-x-3 gap-y-2 border-b border-neutral-100 px-200 py-3 text-body last:border-b-0 md:items-center md:gap-2 md:py-1 ${GRID_COLS} ${account.closed ? "opacity-60" : ""}`}
    >
      {error && (
        <p className="col-span-2 rounded-sm bg-danger/10 px-2 py-1 text-small text-danger md:col-span-full">
          {error}
        </p>
      )}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => commit("name", name)}
        className={`col-span-2 md:col-span-1 ${inputClass}`}
      />

      <AccountTypeSelect
        type={type}
        locked={account.hasTransactions}
        onChange={(value) => {
          if (account.hasTransactions) return;
          setType(value);
          commit("type", value);
        }}
      />
      <OnBudgetCheckbox
        checked={account.onBudget}
        locked={account.hasTransactions}
        onChange={(value) => {
          if (!account.hasTransactions) commit("onBudget", value);
        }}
      />

      <div className="flex items-center gap-2 md:justify-center">
        <input
          type="checkbox"
          defaultChecked={account.closed}
          onChange={(e) => commit("closed", String(e.target.checked))}
          className="h-4 w-4 rounded-sm border-neutral-200 text-brand-700 focus:ring-1 focus:ring-brand-700"
        />
        <span className="text-small text-neutral-600 md:hidden">Closed</span>
      </div>

      <Link
        href={`/accounts/${account.id}`}
        className={
          "col-span-2 text-right font-medium hover:underline md:col-span-1 " +
          (account.balance < 0 ? "text-danger" : "text-success")
        }
      >
        {formatMilliunits(account.balance, currency)}
      </Link>
    </div>
  );
}

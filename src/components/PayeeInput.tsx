"use client";

import { useState } from "react";
import { transferPayeeLabel, type TransferAccountOption } from "@/lib/transfers";

/**
 * The transaction payee field. Payees stay a free-text input (with the
 * existing datalist); open accounts in the same budget are a Transfers
 * section, choosing one fills "Transfer: <account>" (ADR 0007).
 */
export function PayeeInput({
  value,
  accountId,
  payeeNames,
  transferAccounts,
  onChange,
  className,
}: {
  value: string;
  accountId: string;
  payeeNames: string[];
  transferAccounts: TransferAccountOption[];
  onChange: (name: string) => void;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const payees = payeeNames.filter((name) => name.toLowerCase().includes(query));
  const transfers = transferAccounts.filter((account) => {
    if (account.id === accountId) return false;
    const label = transferPayeeLabel(account.name).toLowerCase();
    return label.includes(query) || account.name.toLowerCase().includes(query);
  });

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        list="payee-suggestions"
        placeholder="Payee"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-neutral-200 bg-neutral-0 py-1 shadow-lg">
          <div className="px-2 py-1 text-small font-medium uppercase tracking-wide text-neutral-600">
            Payees
          </div>
          {payees.length === 0 && (
            <div className="px-2 py-1 text-small text-neutral-600">No matching payees</div>
          )}
          {payees.map((name) => (
            <button
              key={name}
              type="button"
              className="block w-full px-2 py-1 text-left text-body hover:bg-neutral-100"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(name);
                setOpen(false);
              }}
            >
              {name}
            </button>
          ))}
          <div className="mt-1 border-t border-neutral-100 px-2 py-1 text-small font-medium uppercase tracking-wide text-neutral-600">
            Transfers
          </div>
          {transfers.length === 0 && (
            <div className="px-2 py-1 text-small text-neutral-600">No other open accounts</div>
          )}
          {transfers.map((account) => (
            <button
              key={account.id}
              type="button"
              className="block w-full px-2 py-1 text-left text-body hover:bg-neutral-100"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(transferPayeeLabel(account.name));
                setOpen(false);
              }}
            >
              {transferPayeeLabel(account.name)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

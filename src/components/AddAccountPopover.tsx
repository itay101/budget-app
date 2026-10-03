"use client";

import { ACCOUNT_TYPE_OPTIONS } from "@/lib/accountTypes";
import { MoneyInput } from "@/components/MoneyInput";
import { AddFormPopover } from "@/components/AddFormPopover";

/**
 * The sidebar's "+ Add account" button, opening a small popover (same
 * pattern as MoveMoneyPopover) with the create-account form, instead of
 * navigating to the Accounts page.
 */
export function AddAccountPopover({
  createAccount,
  currency,
}: {
  createAccount: (formData: FormData) => Promise<void>;
  currency: string;
}) {
  return (
    <AddFormPopover
      triggerLabel="Add account"
      triggerClassName="mt-1 flex w-full items-center gap-0.5 rounded px-3 py-1.5 text-left text-small font-medium text-brand-700 hover:bg-brand-700/10"
      title="Add account"
      submitLabel="Add account"
      onSubmit={createAccount}
    >
      <div>
        <label
          className="block text-small text-neutral-600"
          htmlFor="new-account-name"
        >
          Name
        </label>
        <input
          id="new-account-name"
          name="name"
          required
          autoFocus
          className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
        />
      </div>
      <div>
        <label
          className="block text-small text-neutral-600"
          htmlFor="new-account-type"
        >
          Type
        </label>
        <select
          id="new-account-type"
          name="type"
          defaultValue="CHECKING"
          className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
        >
          {ACCOUNT_TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          className="block text-small text-neutral-600"
          htmlFor="new-account-balance"
        >
          Starting balance
        </label>
        <MoneyInput
          id="new-account-balance"
          name="balance"
          currency={currency}
          defaultValue={0}
          className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
        />
      </div>
    </AddFormPopover>
  );
}

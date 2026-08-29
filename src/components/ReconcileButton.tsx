"use client";

import { useTransition } from "react";
import { formatMilliunits } from "@/lib/money";

/**
 * "Reconcile" entry point for the single-account page (#30). Proposes the
 * account's current cached `balance` as the amount to reconcile to; on
 * confirmation every not-yet-`RECONCILED` transaction on the account is
 * bulk-flipped to `RECONCILED` via `reconcileAccount`. Declining does
 * nothing yet — the mismatch/gap-tracking flow for a wrong proposed amount
 * is a follow-up issue.
 */
export function ReconcileButton({
  accountId,
  balance,
  currency,
  reconcileAccount,
}: {
  accountId: string;
  balance: number;
  currency: string;
  reconcileAccount: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const proposed = formatMilliunits(balance, currency);
    const confirmed = window.confirm(
      `Reconcile this account to ${proposed}? This marks every uncleared and cleared transaction as reconciled.`,
    );
    if (!confirmed) {
      return;
    }

    const formData = new FormData();
    formData.set("accountId", accountId);
    startTransition(async () => {
      await reconcileAccount(formData);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded border border-neutral-200 px-2 py-1 text-small font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
    >
      {pending ? "Reconciling…" : "Reconcile"}
    </button>
  );
}

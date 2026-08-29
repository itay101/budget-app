"use client";

import { useTransition } from "react";
import { formatMilliunits, numberToMilliunits } from "@/lib/money";
import { useReconciliation } from "@/components/ReconciliationContext";

/**
 * "Reconcile" entry point for the single-account page (#30). Proposes the
 * account's current cached `balance` as the amount to reconcile to.
 *
 * - Confirmed → every not-yet-`RECONCILED` transaction on the account is
 *   bulk-flipped to `RECONCILED` via `reconcileAccount`, same as before.
 * - Declined → prompts for the actual statement amount and hands off into
 *   the mismatch/gap-tracking flow (#31): the pinned bar rendered above
 *   `TransactionsTable` takes over from here, via `ReconciliationContext`.
 */
export function ReconcileButton({ balance }: { balance: number }) {
  const [pending, startTransition] = useTransition();
  const reconciliation = useReconciliation();

  // Only ever rendered inside a ReconciliationProvider (accounts/[id]/page.tsx).
  if (!reconciliation) return null;

  const {
    accountId,
    currency,
    reconcileAccount,
    statementAmount,
    startReconciling,
  } = reconciliation;

  function handleClick() {
    const proposed = formatMilliunits(balance, currency);
    const confirmed = window.confirm(
      `Is ${proposed} the correct balance for this account? Reconciling will mark every transaction as reconciled.`,
    );

    if (confirmed) {
      const formData = new FormData();
      formData.set("accountId", accountId);
      startTransition(async () => {
        await reconcileAccount(formData);
      });
      return;
    }

    const input = window.prompt(
      "Enter the correct statement amount for this account:",
    );
    if (input === null || input.trim() === "") return;

    const parsed = Number(input);
    if (Number.isNaN(parsed)) {
      window.alert("Please enter a valid amount.");
      return;
    }

    startReconciling(numberToMilliunits(parsed));
  }

  // While reconciling, the pinned bar above the transactions table owns the
  // Reconcile/Cancel actions instead of this button.
  if (statementAmount !== null) return null;

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

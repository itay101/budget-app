"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Shared client state for the account-level reconciliation flow (#30/#31).
 *
 * `ReconcileButton` (in the account page header) and the pinned
 * reconciliation bar (in `TransactionsTable`, above the transaction list)
 * are siblings under the server-rendered `accounts/[id]` page, so they can't
 * share plain React state directly — this context is the thin bridge
 * between them. It only ever needs to exist on the single-account page:
 * `TransactionsTable` also renders on `accounts/all`, where there's no
 * provider and `useReconciliation()` simply returns `null`.
 */
type ReconciliationState = {
  accountId: string;
  currency: string;
  reconcileAccount: (formData: FormData) => Promise<void>;
  // The statement amount (milliunits) the user is reconciling against, or
  // `null` when not currently in the reconciling state. Living only in this
  // context's `useState` is deliberate (see #31): it doesn't need to survive
  // a page refresh, and it does need to survive the `account.balance`
  // prop updates that revalidatePath triggers while editing transactions.
  statementAmount: number | null;
  startReconciling: (statementAmount: number) => void;
  cancelReconciling: () => void;
};

const ReconciliationContext = createContext<ReconciliationState | null>(null);

export function ReconciliationProvider({
  accountId,
  currency,
  reconcileAccount,
  children,
}: {
  accountId: string;
  currency: string;
  reconcileAccount: (formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [statementAmount, setStatementAmount] = useState<number | null>(null);

  return (
    <ReconciliationContext.Provider
      value={{
        accountId,
        currency,
        reconcileAccount,
        statementAmount,
        startReconciling: setStatementAmount,
        cancelReconciling: () => setStatementAmount(null),
      }}
    >
      {children}
    </ReconciliationContext.Provider>
  );
}

/** Returns `null` outside a `ReconciliationProvider` (e.g. accounts/all's
 * TransactionsTable), rather than throwing — callers that don't need the
 * flow can just no-op on `null`. */
export function useReconciliation() {
  return useContext(ReconciliationContext);
}

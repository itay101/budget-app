export const ACCOUNT_TYPE_OPTIONS = [
  { value: "CHECKING", label: "Checking" },
  { value: "SAVINGS", label: "Savings" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "CASH", label: "Cash" },
  { value: "LINE_OF_CREDIT", label: "Line of Credit" },
  { value: "OTHER", label: "Other" },
] as const;

export const ACCOUNT_TYPES = ACCOUNT_TYPE_OPTIONS.map((o) => o.value);

export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * Whether a growing balance on this account type means more debt, not more
 * money - a Credit Card or Line of Credit purchase increases what's owed,
 * the opposite of every other account type. New cards default to on-budget
 * and get a Payment Category (ADR 0010). File Import auto-flips a
 * single-column amount's sign for the same reason: an export's positive
 * "charge" is an outflow here, not an inflow.
 */
export function isDebtAccountType(type: string): boolean {
  return type === "CREDIT_CARD" || type === "LINE_OF_CREDIT";
}

export const ACCOUNT_TYPE_LOCKED_MESSAGE =
  "Account type can't be changed once the account has transactions. Close this account and open a new one.";

/** An account's type locks once it has transactions, like the on-budget flag (ADR 0007, ADR 0010). */
export function accountTypeChangeError(hasTransactions: boolean, next: string, current: string): string | null {
  if (next !== current && hasTransactions) return ACCOUNT_TYPE_LOCKED_MESSAGE;
  return null;
}

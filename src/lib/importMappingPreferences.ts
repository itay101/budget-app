import type { DateOrder } from "@/lib/importParsing";

type AmountMode = "single" | "split";

// The column mapping a user picked for a given account's last import,
// keyed by header *name* rather than column index - a bank's export can
// reorder columns between statements (or add/drop one) while keeping the
// same header text, and a name still matches then where an index
// wouldn't. A blank/missing header is never saved as a name (see
// ImportTransactionsModal's headerName helper), so this never tries to
// match two different unlabeled columns to each other.
export type SavedColumnMapping = {
  date: string | null;
  payee: string | null;
  memo: string | null;
  amountMode: AmountMode;
  amount: string | null;
  inflow: string | null;
  outflow: string | null;
  dateOrder: "auto" | DateOrder;
};

const STORAGE_PREFIX = "budget-app:import-mapping:";

/**
 * Loads the last column mapping + amount/date-format selection saved for
 * this account (File Import remembers one per account - see
 * ImportTransactionsModal). Returns null on first import for an account,
 * on a hand-edited or stale-shape entry, or if localStorage isn't usable
 * (private browsing, storage disabled) - callers fall back to the
 * existing header-guessing heuristics in that case.
 */
export function loadImportMapping(accountId: string): SavedColumnMapping | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + accountId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const amountMode = (parsed as { amountMode?: unknown }).amountMode;
    if (amountMode !== "single" && amountMode !== "split") return null;
    return parsed as SavedColumnMapping;
  } catch {
    return null;
  }
}

/** Persists the mapping the user just confirmed, for next time this account is imported into. */
export function saveImportMapping(
  accountId: string,
  mapping: SavedColumnMapping,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + accountId,
      JSON.stringify(mapping),
    );
  } catch {
    // Storage full or unavailable - not worth surfacing to the user, the
    // modal still works fine, it just won't remember this time.
  }
}

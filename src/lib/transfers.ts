// Transfer rules from ADR 0007 and the resolution of #138. Pure: the
// transaction editor and the server actions both follow these, and the
// tests pin the category rule and the mirrored fields here.

import { STARTING_BALANCE_PAYEE } from "@/lib/payees";

/** Shown in the payee field. Not a Payee row — the link supplies the name. */
const TRANSFER_PAYEE_PREFIX = "Transfer: ";

/**
 * How far from the transfer's date an unlinked row in the other account
 * can still be offered for linking. #138 says "a few days"; four UTC
 * calendar days either side is the window this app uses.
 */
export const TRANSFER_LINK_WINDOW_DAYS = 4;

export const TRANSFER_CATEGORY_ON_ON =
  "A transfer between on-budget accounts can't have a category";
export const TRANSFER_CATEGORY_OFF_OFF =
  "A transfer between off-budget accounts can't have a category";
export const TRANSFER_CATEGORY_MIXED =
  "A transfer between an on-budget and an off-budget account needs a category on the on-budget account";
export const TRANSFER_CATEGORY_OFF_SIDE =
  "The off-budget side of a transfer can't have a category";

export const ON_BUDGET_LOCKED_MESSAGE =
  "On budget can't be changed once an account has transactions. Close this account and open a new one.";

export function transferPayeeLabel(accountName: string): string {
  return `${TRANSFER_PAYEE_PREFIX}${accountName}`;
}

/** The account name inside a payee field that is exactly "Transfer: <name>". */
export function transferAccountNameFromPayee(payeeName: string): string | null {
  if (!payeeName.startsWith(TRANSFER_PAYEE_PREFIX)) return null;
  const name = payeeName.slice(TRANSFER_PAYEE_PREFIX.length).trim();
  return name.length > 0 ? name : null;
}

/** Text search should find "Transfer: Savings" by the other account's name. */
export function transferSearchText(query: string): string {
  return transferAccountNameFromPayee(query.trim()) ?? query.trim();
}

export type TransferAccountOption = {
  id: string;
  name: string;
  onBudget: boolean;
};

/**
 * The open account a payee field is pointing at, or the row's current
 * counterpart when its name still matches (that account may since have
 * been closed). Null when the field isn't a transfer, or when more than
 * one open account has that name — the server rejects the ambiguous case.
 */
export function matchingTransferAccount(
  payeeName: string,
  accounts: TransferAccountOption[],
  thisAccountId: string,
  current: TransferAccountOption | null,
): TransferAccountOption | null {
  const wanted = transferAccountNameFromPayee(payeeName);
  if (!wanted) return null;
  if (current && current.name === wanted && current.id !== thisAccountId) return current;
  const matches = accounts.filter(
    (account) => account.id !== thisAccountId && account.name === wanted,
  );
  return matches.length === 1 ? matches[0] : null;
}

export type TransferCategoryPlacement = "none" | "this-row" | "other-row";

/** Which row of a pair is allowed to carry the category the editor collected. */
export function transferCategoryPlacement(
  thisOnBudget: boolean,
  otherOnBudget: boolean,
): TransferCategoryPlacement {
  if (thisOnBudget === otherOnBudget) return "none";
  return thisOnBudget ? "this-row" : "other-row";
}

export function transferCategoryDisabledReason(
  thisOnBudget: boolean,
  otherOnBudget: boolean,
): string | null {
  if (thisOnBudget && otherOnBudget) return TRANSFER_CATEGORY_ON_ON;
  if (!thisOnBudget && !otherOnBudget) return TRANSFER_CATEGORY_OFF_OFF;
  if (!thisOnBudget) return TRANSFER_CATEGORY_OFF_SIDE;
  return null;
}

export type ResolvedTransferCategories = {
  sourceCategoryId: string | null;
  otherCategoryId: string | null;
  error: string | null;
};

/**
 * Where the category collected while creating a transfer is stored.
 * On a mixed pair it belongs to the on-budget row, whichever side that is.
 */
export function resolveTransferCategories(
  sides: { sourceOnBudget: boolean; otherOnBudget: boolean },
  enteredCategoryId: string | null,
): ResolvedTransferCategories {
  const { sourceOnBudget, otherOnBudget } = sides;
  if (sourceOnBudget === otherOnBudget) {
    if (enteredCategoryId) {
      return {
        sourceCategoryId: null,
        otherCategoryId: null,
        error: sourceOnBudget ? TRANSFER_CATEGORY_ON_ON : TRANSFER_CATEGORY_OFF_OFF,
      };
    }
    return { sourceCategoryId: null, otherCategoryId: null, error: null };
  }
  if (!enteredCategoryId) {
    return { sourceCategoryId: null, otherCategoryId: null, error: TRANSFER_CATEGORY_MIXED };
  }
  if (sourceOnBudget) {
    return { sourceCategoryId: enteredCategoryId, otherCategoryId: null, error: null };
  }
  return { sourceCategoryId: null, otherCategoryId: enteredCategoryId, error: null };
}

/**
 * Categories after editing one row of an existing pair (or moving it to
 * another account). `enteredCategoryId` is undefined when the edit didn't
 * include a category, and null when the editor cleared it. A category is
 * only written on the row the rule allows; the other row's category is
 * cleared when the rule no longer allows it.
 */
export function categoriesForEditedRow(args: {
  sourceOnBudget: boolean;
  otherOnBudget: boolean;
  sourceCategoryId: string | null;
  otherCategoryId: string | null;
  enteredCategoryId: string | null | undefined;
}): ResolvedTransferCategories {
  const { sourceOnBudget, otherOnBudget, enteredCategoryId } = args;
  if (sourceOnBudget === otherOnBudget) {
    if (enteredCategoryId) {
      return {
        sourceCategoryId: null,
        otherCategoryId: null,
        error: sourceOnBudget ? TRANSFER_CATEGORY_ON_ON : TRANSFER_CATEGORY_OFF_OFF,
      };
    }
    return { sourceCategoryId: null, otherCategoryId: null, error: null };
  }
  if (sourceOnBudget) {
    const next = enteredCategoryId === undefined ? args.sourceCategoryId : enteredCategoryId;
    if (!next) {
      return { sourceCategoryId: null, otherCategoryId: null, error: TRANSFER_CATEGORY_MIXED };
    }
    return { sourceCategoryId: next, otherCategoryId: null, error: null };
  }
  if (enteredCategoryId) {
    return { sourceCategoryId: null, otherCategoryId: null, error: TRANSFER_CATEGORY_OFF_SIDE };
  }
  if (!args.otherCategoryId) {
    return { sourceCategoryId: null, otherCategoryId: null, error: TRANSFER_CATEGORY_MIXED };
  }
  return { sourceCategoryId: null, otherCategoryId: args.otherCategoryId, error: null };
}

export type SharedTransferFields = {
  date: Date;
  amount: number;
  memo: string | null;
};

export type SharedTransferPatch = {
  date?: Date;
  amount?: number;
  memo?: string | null;
};

function negated(amount: number): number {
  // Negating 0 is -0, which is not the same integer milliunits value.
  return amount === 0 ? 0 : -amount;
}

/** The other row's date, negated amount, and memo. */
export function counterpartSharedFields(source: SharedTransferFields): SharedTransferFields {
  return { date: source.date, amount: negated(source.amount), memo: source.memo };
}

/**
 * The counterpart patch for an edit. Only fields present on `patch` are
 * mirrored, and the amount is negated. Cleared status and category are
 * not shared, so they are never included.
 */
export function mirroredSharedPatch(patch: SharedTransferPatch): SharedTransferPatch {
  const mirrored: SharedTransferPatch = {};
  if (patch.date !== undefined) mirrored.date = patch.date;
  if (patch.amount !== undefined) mirrored.amount = negated(patch.amount);
  if (patch.memo !== undefined) mirrored.memo = patch.memo;
  return mirrored;
}

export function onBudgetChangeError(
  hasTransactions: boolean,
  next: boolean,
  current: boolean,
): string | null {
  if (next !== current && hasTransactions) return ON_BUDGET_LOCKED_MESSAGE;
  return null;
}

const DAY_MS = 86_400_000;

/** Whole UTC calendar days between two instants. Transaction dates are UTC midnights. */
function daysApartUTC(a: Date, b: Date): number {
  const day = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.abs(Math.round((day(a) - day(b)) / DAY_MS));
}

export type LinkCandidateRow = {
  id: string;
  date: Date;
  amount: number;
  transferTransactionId: string | null;
  payeeName: string | null;
};

/**
 * Unlinked rows in the other account that can be linked instead of
 * creating a duplicate: the opposite amount, within the link window, and
 * not a Starting Balance (linking one would strip that payee). Closest
 * date first.
 */
export function selectLinkCandidates<T extends LinkCandidateRow>(
  rows: T[],
  query: { amount: number; date: Date; excludeId?: string },
): T[] {
  return rows
    .filter((row) => {
      if (row.transferTransactionId) return false;
      if (query.excludeId && row.id === query.excludeId) return false;
      if (row.amount !== -query.amount) return false;
      if (row.payeeName === STARTING_BALANCE_PAYEE) return false;
      return daysApartUTC(row.date, query.date) <= TRANSFER_LINK_WINDOW_DAYS;
    })
    .sort((a, b) => {
      const closeness = daysApartUTC(a.date, query.date) - daysApartUTC(b.date, query.date);
      if (closeness !== 0) return closeness;
      const time = a.date.getTime() - b.date.getTime();
      if (time !== 0) return time;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export type TransferLinkCandidate = {
  id: string;
  date: string;
  amount: number;
  memo: string | null;
};

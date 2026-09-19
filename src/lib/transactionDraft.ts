// The transaction-editing draft shape TransactionRow and NewTransactionRow
// (see @/components/TransactionsTable) both edit, and the two rules those
// state machines apply to it identically - kept here so a fix only has to
// happen once instead of in both row implementations (#94).

import { numberToMilliunits } from "@/lib/money";

export type Draft = {
  date: string;
  payeeName: string;
  categoryId: string;
  memo: string;
  inflow: string;
  outflow: string;
};

// Whichever side of a draft's inflow/outflow pair has a value wins
// (inflow taking priority if, invalidly, both are set) - the sign rule
// shared by every place a draft's amount is read.
function signedAmount(inflow: number, outflow: number): number {
  return inflow > 0 ? inflow : outflow ? -outflow : 0;
}

// The signed milliunits amount a draft's inflow/outflow pair currently
// represents - used for TransactionRow's collapsed mobile summary, where
// inflow/outflow aren't separate columns.
export function amountFromDraft(draft: Draft): number {
  return signedAmount(
    numberToMilliunits(Number(draft.inflow) || 0),
    numberToMilliunits(Number(draft.outflow) || 0),
  );
}

// The raw decimal amount (dollars, sign included) a draft's inflow/outflow
// pair represents - what a submit sends the server as the "amount" form
// field. createTransaction/updateTransaction parse that field with
// `Number(...)` and milliunits-convert it themselves (see
// src/app/(app)/accounts/actions.ts), so this deliberately does *not* call
// numberToMilliunits itself - doing so would double-convert and inflate
// every saved amount 1000x.
export function draftAmountInput(draft: Draft): number {
  return signedAmount(Number(draft.inflow) || 0, Number(draft.outflow) || 0);
}

// Payee changes get their own handler (#88): as long as the draft doesn't
// already have a category, setting the payee to one with a remembered
// default category (see payeeLastCategory) fills that category in too,
// rather than leaving the user to reselect what they almost always pick
// anyway. A category the user already chose is never overridden.
export function applyPayeeChange(
  draft: Draft,
  name: string,
  payeeLastCategory: Record<string, string>,
): Draft {
  const defaultCategoryId = payeeLastCategory[name];
  return {
    ...draft,
    payeeName: name,
    categoryId:
      !draft.categoryId && defaultCategoryId
        ? defaultCategoryId
        : draft.categoryId,
  };
}

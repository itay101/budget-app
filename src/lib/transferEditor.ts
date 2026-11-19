// Pure helpers for the transaction editor's transfer behaviour (ADR 0007).
// Kept out of the table component so the category rule and the row label
// can be tested without rendering.

import {
  transferCategoryDisabledReason,
  transferCategoryPlacement,
  transferPayeeLabel,
  type TransferAccountOption,
  type TransferLinkCandidate,
} from "@/lib/transfers";

type ClearedStatus = "UNCLEARED" | "CLEARED" | "RECONCILED";

export type TransactionInput = {
  id: string;
  date: Date;
  payee: { name: string } | null;
  categoryId: string | null;
  memo: string | null;
  amount: number;
  cleared: ClearedStatus;
  account?: { id?: string; name?: string; onBudget?: boolean };
  transferTransaction?: {
    id: string;
    categoryId: string | null;
    cleared: ClearedStatus;
    account: { id: string; name: string; onBudget: boolean };
  } | null;
};

export type TransactionRowData = {
  id: string;
  date: string;
  payeeName: string;
  categoryId: string;
  memo: string;
  amount: number;
  cleared: ClearedStatus;
  accountName?: string;
  accountId: string;
  accountOnBudget: boolean;
  transferAccountId: string;
  transferAccountName: string;
  transferAccountOnBudget: boolean | null;
  counterpartCleared: ClearedStatus | null;
  counterpartCategoryId: string | null;
};

export function toRowData(transaction: TransactionInput): TransactionRowData {
  const transfer = transaction.transferTransaction ?? null;
  return {
    id: transaction.id,
    date: transaction.date.toISOString(),
    payeeName: transfer ? transferPayeeLabel(transfer.account.name) : (transaction.payee?.name ?? ""),
    categoryId: transaction.categoryId ?? "",
    memo: transaction.memo ?? "",
    amount: transaction.amount,
    cleared: transaction.cleared,
    accountName: transaction.account?.name,
    accountId: transaction.account?.id ?? "",
    accountOnBudget: transaction.account?.onBudget ?? true,
    transferAccountId: transfer?.account.id ?? "",
    transferAccountName: transfer?.account.name ?? "",
    transferAccountOnBudget: transfer ? transfer.account.onBudget : null,
    counterpartCleared: transfer?.cleared ?? null,
    counterpartCategoryId: transfer?.categoryId ?? null,
  };
}

export function linkOfferMessage(accountName: string, candidates: TransferLinkCandidate[]): string | null {
  const closest = candidates[0];
  if (!closest) return null;
  const detail = closest.memo ? `${closest.date}, ${closest.memo}` : closest.date;
  const others = candidates.length - 1;
  const more =
    others > 0
      ? ` ${others} other matching transaction${others === 1 ? " is" : "s are"} also within a few days. OK links the closest one.`
      : "";
  return `${accountName} already has a matching transaction (${detail}). Link it instead of creating a duplicate?${more} OK links it. Cancel creates a new transaction.`;
}

export function bulkDeleteMessage(count: number, includesTransfer: boolean): string {
  const noun = count === 1 ? "" : "s";
  const bothSides = includesTransfer ? " Linked transfers delete both sides." : "";
  return `Delete ${count} transaction${noun}?${bothSides} This can't be undone.`;
}

type GroupOption = { categories: { id: string; name: string }[] };

function categoryName(groups: GroupOption[], categoryId: string): string | null {
  for (const group of groups) {
    const match = group.categories.find((category) => category.id === categoryId);
    if (match) return match.name;
  }
  return null;
}

export function categoryEditorState(args: {
  isStartingBalance: boolean;
  accountOnBudget: boolean;
  transfer: TransferAccountOption | null;
  existingTransfer: boolean;
  categoryGroups: GroupOption[];
  counterpartCategoryId: string | null;
}): { disabled: boolean; disabledLabel: string; disabledTitle?: string; hint: string | null } {
  if (args.isStartingBalance) {
    return {
      disabled: true,
      disabledLabel: "Uncategorized",
      disabledTitle: "Starting balance can't be categorized",
      hint: null,
    };
  }
  return categoryStateForTransfer(args);
}

function categoryStateForTransfer(args: {
  accountOnBudget: boolean;
  transfer: TransferAccountOption | null;
  existingTransfer: boolean;
  categoryGroups: GroupOption[];
  counterpartCategoryId: string | null;
}): { disabled: boolean; disabledLabel: string; disabledTitle?: string; hint: string | null } {
  if (!args.transfer) return { disabled: false, disabledLabel: "Uncategorized", hint: null };
  const placement = transferCategoryPlacement(args.accountOnBudget, args.transfer.onBudget);
  if (placement === "none") {
    return {
      disabled: true,
      disabledLabel: "No category",
      disabledTitle: transferCategoryDisabledReason(args.accountOnBudget, args.transfer.onBudget) ?? undefined,
      hint: null,
    };
  }
  if (placement === "other-row" && args.existingTransfer) {
    const label = categoryName(args.categoryGroups, args.counterpartCategoryId ?? "") ?? "No category";
    return {
      disabled: true,
      disabledLabel: label,
      disabledTitle: `The category is on ${args.transfer.name}`,
      hint: null,
    };
  }
  if (placement === "other-row") {
    return {
      disabled: false,
      disabledLabel: "Uncategorized",
      hint: `This category is recorded on ${args.transfer.name}.`,
    };
  }
  return { disabled: false, disabledLabel: "Uncategorized", hint: null };
}

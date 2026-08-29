"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { numberToMilliunits } from "@/lib/money";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/accountTypes";

export async function createAccount(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const typeInput = String(formData.get("type") ?? "CHECKING");
  const balanceInput = String(formData.get("balance") ?? "0");

  if (!name) {
    throw new Error("Account name is required");
  }

  const type = ACCOUNT_TYPES.includes(typeInput as AccountType)
    ? (typeInput as AccountType)
    : "CHECKING";

  const balance = numberToMilliunits(Number(balanceInput) || 0);
  const budget = await getCurrentBudget();

  await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        budgetId: budget.id,
        name,
        type,
        balance,
        onBudget: type !== "CREDIT_CARD" && type !== "LINE_OF_CREDIT",
      },
    });

    if (balance !== 0) {
      // A nonzero starting balance is recorded as a real transaction (the
      // same "Starting Balance" convention YNAB itself uses) so the
      // account's transaction list always sums to its balance, instead of
      // showing a balance with nothing behind it.
      const payeeName = "Starting Balance";
      const payee =
        (await tx.payee.findFirst({
          where: { budgetId: budget.id, name: payeeName },
        })) ??
        (await tx.payee.create({
          data: { budgetId: budget.id, name: payeeName },
        }));

      await tx.transaction.create({
        data: {
          accountId: account.id,
          payeeId: payee.id,
          date: new Date(),
          amount: balance,
          memo: "Starting balance",
          cleared: "RECONCILED",
        },
      });
    }
  });

  revalidatePath("/accounts");
  revalidatePath("/accounts/all");
  revalidatePath("/budget");
}

/**
 * Updates one or more fields of a transaction. Each editable cell in a
 * transaction table (single-account or all-accounts) commits
 * independently — only the fields present in `formData` are touched,
 * everything else is left as-is.
 *
 * `amount` (in dollars, sign included — Inflow commits it positive,
 * Outflow commits it negated) keeps the owning account's cached `balance`
 * in sync by the delta between the old and new amount.
 */
export async function updateTransaction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) {
    throw new Error("transactionId is required");
  }

  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: {
      accountId: true,
      amount: true,
      account: { select: { budgetId: true } },
    },
  });

  const data: {
    date?: Date;
    payeeId?: string | null;
    categoryId?: string | null;
    memo?: string | null;
    amount?: number;
  } = {};

  if (formData.has("date")) {
    const dateInput = String(formData.get("date") ?? "");
    if (!dateInput) {
      throw new Error("Date is required");
    }
    data.date = new Date(dateInput);
  }

  if (formData.has("payeeName")) {
    const payeeName = String(formData.get("payeeName") ?? "").trim();
    if (!payeeName) {
      data.payeeId = null;
    } else {
      const budgetId = transaction.account.budgetId;
      const existing = await prisma.payee.findFirst({
        where: { budgetId, name: payeeName },
      });
      data.payeeId = existing
        ? existing.id
        : (await prisma.payee.create({ data: { budgetId, name: payeeName } }))
            .id;
    }
  }

  if (formData.has("categoryId")) {
    data.categoryId = String(formData.get("categoryId") ?? "") || null;
  }

  if (formData.has("memo")) {
    data.memo = String(formData.get("memo") ?? "").trim() || null;
  }

  if (formData.has("amount")) {
    data.amount = numberToMilliunits(Number(formData.get("amount")) || 0);
  }

  if (Object.keys(data).length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({ where: { id: transactionId }, data });

    if (data.amount !== undefined && data.amount !== transaction.amount) {
      await tx.account.update({
        where: { id: transaction.accountId },
        data: { balance: { increment: data.amount - transaction.amount } },
      });
    }
  });

  revalidatePath(`/accounts/${transaction.accountId}`);
  revalidatePath("/accounts/all");
  revalidatePath("/accounts");
  revalidatePath("/budget");
}

/**
 * Deletes a transaction outright and backs its amount out of the owning
 * account's cached `balance` — the inverse of the balance bookkeeping in
 * updateTransaction/createAccount.
 */
export async function deleteTransaction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) {
    throw new Error("transactionId is required");
  }

  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: { accountId: true, amount: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id: transactionId } });
    await tx.account.update({
      where: { id: transaction.accountId },
      data: { balance: { decrement: transaction.amount } },
    });
  });

  revalidatePath(`/accounts/${transaction.accountId}`);
  revalidatePath("/accounts/all");
  revalidatePath("/accounts");
  revalidatePath("/budget");
}

/**
 * Reconciles an account: every transaction on it whose `cleared` isn't
 * already `"RECONCILED"` is flipped to `"RECONCILED"`. This is the
 * happy-path half of the Reconcile flow (#30) — the caller has already
 * confirmed the account's current `balance` is correct, so there's nothing
 * left to adjust, just the cleared status to stamp. The mismatch/gap
 * tracking path (when the proposed amount is wrong) is a follow-up issue
 * and reuses this same action once the balance is squared up first.
 */
export async function reconcileAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) {
    throw new Error("accountId is required");
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.updateMany({
      where: { accountId, cleared: { not: "RECONCILED" } },
      data: { cleared: "RECONCILED" },
    });
  });

  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/accounts/all");
  revalidatePath("/accounts");
}

/**
 * Reverts a single transaction from `"RECONCILED"` back to `"CLEARED"` -
 * the per-row undo for reconcileAccount's bulk flip. Landing on `CLEARED`
 * rather than `UNCLEARED` mirrors YNAB: un-reconciling just unlocks the
 * transaction again, it doesn't forget that it was already matched
 * against the bank.
 */
export async function unreconcileTransaction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) {
    throw new Error("transactionId is required");
  }

  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: { accountId: true },
  });

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { cleared: "CLEARED" },
  });

  revalidatePath(`/accounts/${transaction.accountId}`);
  revalidatePath("/accounts/all");
  revalidatePath("/accounts");
}

/**
 * Updates one or more metadata fields of an account (name, type, on-budget,
 * closed) — each editable cell on the Accounts page commits independently,
 * same pattern as updateTransaction. Balance isn't editable here: it's
 * derived from the account's transactions (see createAccount's Starting
 * Balance transaction), not a bare field to overwrite.
 */
export async function updateAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) {
    throw new Error("accountId is required");
  }

  const data: {
    name?: string;
    type?: AccountType;
    onBudget?: boolean;
    closed?: boolean;
  } = {};

  if (formData.has("name")) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      throw new Error("Account name is required");
    }
    data.name = name;
  }

  if (formData.has("type")) {
    const typeInput = String(formData.get("type") ?? "");
    if (!ACCOUNT_TYPES.includes(typeInput as AccountType)) {
      throw new Error("Invalid account type");
    }
    data.type = typeInput as AccountType;
  }

  if (formData.has("onBudget")) {
    data.onBudget = formData.get("onBudget") === "true";
  }

  if (formData.has("closed")) {
    data.closed = formData.get("closed") === "true";
  }

  if (Object.keys(data).length === 0) {
    return;
  }

  await prisma.account.update({ where: { id: accountId }, data });

  revalidatePath("/accounts");
  revalidatePath("/accounts/all");
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/budget");
}

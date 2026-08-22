"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBudget } from "@/lib/budget";
import { numberToMilliunits } from "@/lib/money";

const ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "CASH",
  "LINE_OF_CREDIT",
  "OTHER",
] as const;

export async function createAccount(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const typeInput = String(formData.get("type") ?? "CHECKING");
  const balanceInput = String(formData.get("balance") ?? "0");

  if (!name) {
    throw new Error("Account name is required");
  }

  const type = ACCOUNT_TYPES.includes(typeInput as (typeof ACCOUNT_TYPES)[number])
    ? (typeInput as (typeof ACCOUNT_TYPES)[number])
    : "CHECKING";

  const balance = numberToMilliunits(Number(balanceInput) || 0);
  const budget = await getOrCreateDefaultBudget();

  await prisma.account.create({
    data: {
      budgetId: budget.id,
      name,
      type,
      balance,
      onBudget: type !== "CREDIT_CARD" && type !== "LINE_OF_CREDIT",
    },
  });

  revalidatePath("/accounts");
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

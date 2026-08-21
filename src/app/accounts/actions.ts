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

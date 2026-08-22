"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CURRENT_BUDGET_COOKIE } from "@/lib/budget";
import { isCurrencyCode } from "@/lib/currencies";

/**
 * Opens a new budget in the given currency and switches to it. One budget
 * per currency: this is the primary guard (a friendly error before ever
 * touching the database), backed by the `Budget.currency` unique
 * constraint for the race where two requests create the same currency at
 * once.
 */
export async function createBudget(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "")
    .trim()
    .toUpperCase();

  if (!name) {
    throw new Error("Budget name is required");
  }
  if (!isCurrencyCode(currency)) {
    throw new Error("Choose a currency");
  }

  const existing = await prisma.budget.findFirst({ where: { currency } });
  if (existing) {
    throw new Error(
      `"${existing.name}" already uses ${currency} — each currency can only be open in one budget.`,
    );
  }

  let budget;
  try {
    budget = await prisma.budget.create({ data: { name, currency } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error(`A budget for ${currency} already exists.`);
    }
    throw err;
  }

  cookies().set(CURRENT_BUDGET_COOKIE, budget.id, { path: "/" });
  revalidatePath("/", "layout");
}

/** Switches which budget the app renders against. */
export async function switchBudget(formData: FormData) {
  const budgetId = String(formData.get("budgetId") ?? "");
  if (!budgetId) {
    throw new Error("budgetId is required");
  }

  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) {
    throw new Error("Budget not found");
  }

  cookies().set(CURRENT_BUDGET_COOKIE, budget.id, { path: "/" });
  revalidatePath("/", "layout");
}

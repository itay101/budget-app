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

  const existing = await prisma.budget.findFirst({
    where: { currency, deleted: false },
  });
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

  (await cookies()).set(CURRENT_BUDGET_COOKIE, budget.id, { path: "/" });
  revalidatePath("/", "layout");
}

/** Renames a budget. The currency isn't editable here — it's fixed for a
 * budget's lifetime by the uniqueness guard in createBudget. */
export async function renameBudget(formData: FormData) {
  const budgetId = String(formData.get("budgetId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!budgetId) {
    throw new Error("budgetId is required");
  }
  if (!name) {
    throw new Error("Budget name is required");
  }

  await prisma.budget.update({ where: { id: budgetId }, data: { name } });

  revalidatePath("/", "layout");
}

/** Switches which budget the app renders against. */
export async function switchBudget(formData: FormData) {
  const budgetId = String(formData.get("budgetId") ?? "");
  if (!budgetId) {
    throw new Error("budgetId is required");
  }

  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, deleted: false },
  });
  if (!budget) {
    throw new Error("Budget not found");
  }

  (await cookies()).set(CURRENT_BUDGET_COOKIE, budget.id, { path: "/" });
  revalidatePath("/", "layout");
}

/**
 * Soft-deletes a budget — marks it `deleted` and closes every one of its
 * accounts (so they drop out of the open-accounts totals and move to the
 * sidebar's "Closed" section), but doesn't remove anything from the
 * database. That's left to a future cleanup job; until then the data is
 * just inaccessible through the app, the same way a deleted budget's
 * currency becomes available again for a new budget (see the partial
 * unique index in prisma/schema.prisma) without the old row actually
 * going away.
 *
 * Deliberately hard to trigger by accident: the caller must submit the
 * budget's exact current name as `confirmName`, mirroring the "type the
 * name to confirm" pattern for destructive actions elsewhere (GitHub repo
 * deletion, etc.) — enforced here, not just in the UI, since this is a
 * server action any client could call directly.
 */
export async function deleteBudget(formData: FormData) {
  const budgetId = String(formData.get("budgetId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();

  if (!budgetId) {
    throw new Error("budgetId is required");
  }

  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, deleted: false },
  });
  if (!budget) {
    throw new Error("Budget not found");
  }
  if (confirmName !== budget.name) {
    throw new Error("Typed name doesn't match the budget's name");
  }

  await prisma.$transaction([
    prisma.budget.update({ where: { id: budgetId }, data: { deleted: true } }),
    prisma.account.updateMany({
      where: { budgetId },
      data: { closed: true },
    }),
  ]);

  const cookieStore = await cookies();
  if (cookieStore.get(CURRENT_BUDGET_COOKIE)?.value === budgetId) {
    cookieStore.delete(CURRENT_BUDGET_COOKIE);
  }

  revalidatePath("/", "layout");
}

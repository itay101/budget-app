"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CURRENT_BUDGET_COOKIE } from "@/lib/budget";
import { isCurrencyCode } from "@/lib/currencies";
import { getCurrentUser } from "@/lib/auth";
import { requireBudgetAccess, requireBudgetOwnership } from "@/lib/authorization";

/**
 * Opens a new budget, owned by the signed-in user, in the given currency,
 * and switches to it. One budget per currency *per owner* — this is the
 * primary guard (a friendly error before ever touching the database),
 * backed by the `(ownerId, currency)` unique constraint for the race
 * where two requests from the same owner create the same currency at
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

  const user = await getCurrentUser();

  const existing = await prisma.budget.findFirst({
    where: { currency, deleted: false, ownerId: user.id },
  });
  if (existing) {
    throw new Error(
      `"${existing.name}" already uses ${currency} — each currency can only be open in one of your budgets.`,
    );
  }

  let budget;
  try {
    budget = await prisma.budget.create({
      data: { name, currency, ownerId: user.id },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error(`A budget for ${currency} already exists.`);
    }
    throw err;
  }

  cookies().set(CURRENT_BUDGET_COOKIE, budget.id, { path: "/" });
  revalidatePath("/", "layout");
}

/**
 * Renames a budget. The currency isn't editable here — it's fixed for a
 * budget's lifetime by the uniqueness guard in createBudget.
 *
 * Owner-only, same as deleteBudget below: renaming/deleting are budget-
 * identity operations, distinct from the "read and edit accounts/
 * categories/transactions" access a Collaborator has (CONTEXT.md).
 */
export async function renameBudget(formData: FormData) {
  const budgetId = String(formData.get("budgetId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!budgetId) {
    throw new Error("budgetId is required");
  }
  if (!name) {
    throw new Error("Budget name is required");
  }

  await requireBudgetOwnership(budgetId);

  await prisma.budget.update({ where: { id: budgetId }, data: { name } });

  revalidatePath("/", "layout");
}

/** Switches which budget the app renders against — any budget this user
 * can access (owns or collaborates on). */
export async function switchBudget(formData: FormData) {
  const budgetId = String(formData.get("budgetId") ?? "");
  if (!budgetId) {
    throw new Error("budgetId is required");
  }

  const { budget } = await requireBudgetAccess(budgetId);

  cookies().set(CURRENT_BUDGET_COOKIE, budget.id, { path: "/" });
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
 *
 * Owner-only (CONTEXT.md: deleting the Budget is one of the Owner's
 * exclusive rights) — a Collaborator gets the same "Budget not found" a
 * stranger would, per requireBudgetOwnership's doc comment.
 */
export async function deleteBudget(formData: FormData) {
  const budgetId = String(formData.get("budgetId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();

  if (!budgetId) {
    throw new Error("budgetId is required");
  }

  const { budget } = await requireBudgetOwnership(budgetId);
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

  if (cookies().get(CURRENT_BUDGET_COOKIE)?.value === budgetId) {
    cookies().delete(CURRENT_BUDGET_COOKIE);
  }

  revalidatePath("/", "layout");
}

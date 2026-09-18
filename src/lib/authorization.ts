import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { Budget, User } from "@prisma/client";

/**
 * Prisma `where` fragment: Budgets a given user can access — the ones
 * they own, plus the ones they collaborate on (ADR 0001: ownership is
 * `Budget.ownerId`, not a BudgetMembership row, so both have to be
 * checked). Exported so callers that already have their own `where`
 * clause (e.g. a list query) can splice it in rather than re-fetching.
 */
export function accessibleBudgetWhere(userId: string) {
  return {
    OR: [{ ownerId: userId }, { memberships: { some: { userId } } }],
  };
}

/**
 * Resolves and authorizes a Budget by id for the signed-in user — the
 * single chokepoint every action/page that takes a `budgetId` (directly,
 * or by first resolving one from an accountId/categoryId/etc.) should
 * route through. Throws the same "Budget not found" whether the budget
 * doesn't exist, is deleted, or simply isn't this user's to see, so a
 * client guessing ids learns nothing from the difference.
 */
export async function requireBudgetAccess(
  budgetId: string,
  user?: User,
): Promise<{ user: User; budget: Budget }> {
  const currentUser = user ?? (await getCurrentUser());
  const budget = await prisma.budget.findFirst({
    where: {
      id: budgetId,
      deleted: false,
      ...accessibleBudgetWhere(currentUser.id),
    },
  });
  if (!budget) {
    throw new Error("Budget not found");
  }
  return { user: currentUser, budget };
}

/**
 * Same check, but for the Owner-only subset of Budget actions (rename,
 * delete — see CONTEXT.md's Owner definition). A Collaborator gets the
 * same "Budget not found" as someone with no access at all, rather than
 * a "you're not the owner" that would confirm the budget exists.
 */
export async function requireBudgetOwnership(
  budgetId: string,
  user?: User,
): Promise<{ user: User; budget: Budget }> {
  const currentUser = user ?? (await getCurrentUser());
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, deleted: false, ownerId: currentUser.id },
  });
  if (!budget) {
    throw new Error("Budget not found");
  }
  return { user: currentUser, budget };
}

/**
 * Authorizes access to an Account by id, via the Budget it belongs to.
 * Every mutation that takes an `accountId` straight from client input
 * (createTransaction, importTransactions, ...) needs this — otherwise
 * any signed-in user could pass any accountId, including one from a
 * Budget they have no access to.
 */
export async function requireAccountAccess(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { budgetId: true },
  });
  if (!account) {
    throw new Error("Account not found");
  }
  const { user } = await requireBudgetAccess(account.budgetId);
  return { user, budgetId: account.budgetId };
}

/** Authorizes access to a Transaction by id, via its Account's Budget. */
export async function requireTransactionAccess(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { account: { select: { budgetId: true } } },
  });
  if (!transaction) {
    throw new Error("Transaction not found");
  }
  const { user } = await requireBudgetAccess(transaction.account.budgetId);
  return { user, budgetId: transaction.account.budgetId };
}

/** Authorizes access to a CategoryGroup by id, via its Budget. */
export async function requireCategoryGroupAccess(categoryGroupId: string) {
  const group = await prisma.categoryGroup.findUnique({
    where: { id: categoryGroupId },
    select: { budgetId: true },
  });
  if (!group) {
    throw new Error("Category group not found");
  }
  const { user } = await requireBudgetAccess(group.budgetId);
  return { user, budgetId: group.budgetId };
}

/** Authorizes access to a Category by id, via its CategoryGroup's Budget. */
export async function requireCategoryAccess(categoryId: string) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { categoryGroup: { select: { budgetId: true } } },
  });
  if (!category) {
    throw new Error("Category not found");
  }
  const { user } = await requireBudgetAccess(category.categoryGroup.budgetId);
  return { user, budgetId: category.categoryGroup.budgetId };
}

import type { Account } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accessibleBudgetWhere } from "@/lib/authorization";

/**
 * What the account page should do with an `/accounts/[id]` URL:
 *
 * - `found`: the account is in the current budget, so render it.
 * - `otherBudget`: the account belongs to another budget this user can
 *   access (owns or collaborates on, deleted or not). This happens after
 *   switching, creating or deleting a budget while on an account page,
 *   since those actions change the current-budget cookie but keep the
 *   URL (#204). The page sends them to the current budget's accounts list.
 * - `notFound`: no such account, or one in a budget this user can't
 *   access. Both 404 the same way, so guessing ids reveals nothing.
 */
export type AccountPageLookup =
  | { kind: "found"; account: Account }
  | { kind: "otherBudget" }
  | { kind: "notFound" };

export async function lookupAccountForPage(
  accountId: string,
  currentBudgetId: string,
  userId: string,
): Promise<AccountPageLookup> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, budgetId: currentBudgetId },
  });
  if (account) return { kind: "found", account };

  const elsewhere = await prisma.account.findFirst({
    where: { id: accountId, budget: accessibleBudgetWhere(userId) },
    select: { id: true },
  });
  return elsewhere ? { kind: "otherBudget" } : { kind: "notFound" };
}

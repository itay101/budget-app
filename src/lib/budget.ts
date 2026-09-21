import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { accessibleBudgetWhere } from "@/lib/authorization";
import { auditedUpdate } from "@/lib/audit";

/**
 * This app supports multiple budgets per user — one per currency (see
 * src/app/budgets/actions.ts) — so a user can keep, say, a "Personal" USD
 * budget and a "Travel" EUR budget side by side, and can be shared with
 * Collaborators (see CONTEXT.md). Which one is "current" is tracked in
 * this cookie rather than the URL.
 */
export const CURRENT_BUDGET_COOKIE = "budgetId";

/**
 * The budget every page renders against, scoped to the signed-in user
 * (owner or collaborator — see src/lib/authorization.ts). Honors the
 * cookie set by switchBudget/createBudget when it points at a budget
 * this user can still access, otherwise falls back to their oldest
 * accessible budget — creating a default USD one, owned by them, if they
 * don't have access to any budget yet (a brand-new user's very first
 * visit), so the app still works either way.
 */
export async function getCurrentBudget() {
  const user = await getCurrentUser();
  const where = accessibleBudgetWhere(user.id);
  const selectedId = (await cookies()).get(CURRENT_BUDGET_COOKIE)?.value;

  if (selectedId) {
    const selected = await prisma.budget.findFirst({
      where: { id: selectedId, deleted: false, ...where },
    });
    if (selected) return selected;
  }

  const first = await prisma.budget.findFirst({
    where: { deleted: false, ...where },
    orderBy: { createdAt: "asc" },
  });
  if (first) return first;

  return prisma.budget.create({
    data: { name: "My Budget", currency: "USD", ownerId: user.id },
  });
}

export type BudgetSummary = {
  id: string;
  name: string;
  currency: string;
  /** Whether the signed-in user is this Budget's Owner (vs. a Collaborator). */
  isOwner: boolean;
  /** The Owner's email — only meaningful for a budget this user doesn't own. */
  ownerEmail: string;
  /** Only populated for budgets this user owns — see BudgetSwitcherPopover's
   * inline collaborator management (#76); a Collaborator doesn't get the
   * rest of a Budget's membership list handed to them (BudgetSwitcherList's
   * expanded row renders them via CollaboratorManager, #96). */
  collaborators: { userId: string; email: string }[];
  pendingInvites: { id: string; email: string }[];
};

/** Every non-deleted budget this user can access (owns or collaborates
 * on), for the sidebar's budget switcher — including, for the ones they
 * own, enough of their collaborator/pending-invite state to manage them
 * inline (#76) without a second round trip. */
export async function listBudgets(): Promise<BudgetSummary[]> {
  const user = await getCurrentUser();
  const budgets = await prisma.budget.findMany({
    where: { deleted: false, ...accessibleBudgetWhere(user.id) },
    orderBy: { createdAt: "asc" },
    include: {
      owner: { select: { email: true } },
      memberships: { include: { user: { select: { email: true } } } },
      invites: { select: { id: true, email: true }, orderBy: { createdAt: "asc" } },
    },
  });

  return budgets.map((b) => {
    const isOwner = b.ownerId === user.id;
    return {
      id: b.id,
      name: b.name,
      currency: b.currency,
      isOwner,
      ownerEmail: b.owner.email,
      collaborators: isOwner
        ? b.memberships.map((m) => ({ userId: m.userId, email: m.user.email }))
        : [],
      pendingInvites: isOwner
        ? b.invites.map((i) => ({ id: i.id, email: i.email }))
        : [],
    };
  });
}

/**
 * Marks a budget deleted and closes its accounts — the core of
 * deleteBudget's explicit, confirmed flow (src/app/budgets/actions.ts)
 * and of account deactivation's automatic one (src/app/auth/actions.ts,
 * ADR 0004): a Budget the deactivating owner holds outright, with no
 * Collaborators, is soft-deleted the same way, just without a
 * "type the name to confirm" step in front of it. Doesn't touch the
 * current-budget cookie or the Budget's pending Invites — callers handle
 * whichever of those apply to them.
 *
 * Writes the BUDGET "deleted" AuditEntry (#75/ADR 0002) itself, atomically
 * with the soft-delete, rather than leaving each caller to duplicate it —
 * `actorId` is the Owner in deleteBudget's explicit flow, or the
 * deactivating Owner themselves in account deactivation's automatic one.
 */
export async function softDeleteBudget(budgetId: string, actorId: string) {
  await prisma.$transaction((tx) =>
    auditedUpdate({
      tx,
      budgetId,
      entityType: "BUDGET",
      entityId: budgetId,
      actorId,
      action: "deleted",
      before: { deleted: false },
      after: { deleted: true },
      apply: async () => {
        await tx.budget.update({ where: { id: budgetId }, data: { deleted: true } });
        await tx.account.updateMany({
          where: { budgetId },
          data: { closed: true },
        });
      },
    }),
  );
}

/**
 * Per-category running totals through a given month, keyed by category id:
 * everything ever budgeted (or spent/earned) in that category from the
 * beginning of time up to and including the month in question. Built by
 * the caller (src/app/budget/page.tsx) from two `groupBy` queries scoped
 * to `date`/`month < nextMonth`, and passed in as plain `Map`s so
 * availableFor/rowFor don't need to know Prisma's query-result shapes.
 */
export type ThroughMonthTotals = Map<string, number>;

/**
 * YNAB-style "available rolls forward" math (#49): this month's available
 * for a category is everything ever budgeted to it through this month,
 * plus everything ever spent/earned in it through this month. That's
 * equivalent to (last month's available) + (this month's budgeted) +
 * (this month's activity), computed here as a running total rather than
 * recursively — so a category with $0 budgeted this month but money left
 * over from last month still shows that leftover, and one that's
 * overspent stays negative until enough gets budgeted to cover it.
 *
 * Moved out of the page component (where it lived as a local closure) so
 * this math — the highest-consequence arithmetic in the app — is directly
 * unit testable instead of only reachable through the rendered page.
 */
export function availableFor(
  categoryId: string,
  budgetedThroughMonth: ThroughMonthTotals,
  activityThroughMonth: ThroughMonthTotals,
): number {
  return (
    (budgetedThroughMonth.get(categoryId) ?? 0) +
    (activityThroughMonth.get(categoryId) ?? 0)
  );
}

/**
 * The bits of a category's *this month's* numbers rowFor needs, kept
 * independent of Prisma's `include` shape so callers (and tests) can pass
 * plain objects instead of a full Prisma category.
 */
export interface CategoryMonthActivity {
  id: string;
  name: string;
  /** This month's budgeted amount only — not the running total. */
  budgeted: number;
  /** This month's activity only (sum of this month's transaction amounts). */
  activity: number;
}

export interface CategoryRow extends CategoryMonthActivity {
  available: number;
}

/**
 * One row of the budget table: this month's budgeted/activity alongside
 * the rolled-forward available (see availableFor).
 */
export function rowFor(
  category: CategoryMonthActivity,
  budgetedThroughMonth: ThroughMonthTotals,
  activityThroughMonth: ThroughMonthTotals,
): CategoryRow {
  return {
    id: category.id,
    name: category.name,
    budgeted: category.budgeted,
    activity: category.activity,
    available: availableFor(category.id, budgetedThroughMonth, activityThroughMonth),
  };
}

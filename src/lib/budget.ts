import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * This is a single-user app (no auth), but it supports multiple budgets —
 * one per currency (see src/app/budgets/actions.ts) — so a user can keep,
 * say, a "Personal" USD budget and a "Travel" EUR budget side by side.
 * Which one is "current" is tracked in this cookie rather than the URL,
 * since there's no session/user model to hang it off of instead.
 */
export const CURRENT_BUDGET_COOKIE = "budgetId";

/**
 * The budget every page renders against. Honors the cookie set by
 * switchBudget/createBudget when it points at a budget that still exists
 * and isn't deleted, otherwise falls back to the oldest non-deleted
 * budget — creating a default USD one on first run (or if every budget
 * has since been deleted), so the app still works either way.
 */
export async function getCurrentBudget() {
  const selectedId = cookies().get(CURRENT_BUDGET_COOKIE)?.value;

  if (selectedId) {
    const selected = await prisma.budget.findFirst({
      where: { id: selectedId, deleted: false },
    });
    if (selected) return selected;
  }

  const first = await prisma.budget.findFirst({
    where: { deleted: false },
    orderBy: { createdAt: "asc" },
  });
  if (first) return first;

  return prisma.budget.create({ data: { name: "My Budget", currency: "USD" } });
}

/** Every non-deleted budget, for the sidebar's budget switcher. */
export async function listBudgets() {
  return prisma.budget.findMany({
    where: { deleted: false },
    orderBy: { createdAt: "asc" },
  });
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

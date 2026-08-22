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
 * switchBudget/createBudget when it points at a budget that still exists,
 * otherwise falls back to the oldest budget — creating a default USD one
 * on first run, so the app still works before any budget has been
 * explicitly created.
 */
export async function getCurrentBudget() {
  const selectedId = cookies().get(CURRENT_BUDGET_COOKIE)?.value;

  if (selectedId) {
    const selected = await prisma.budget.findUnique({
      where: { id: selectedId },
    });
    if (selected) return selected;
  }

  const first = await prisma.budget.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (first) return first;

  return prisma.budget.create({ data: { name: "My Budget", currency: "USD" } });
}

/** Every budget, for the sidebar's budget switcher. */
export async function listBudgets() {
  return prisma.budget.findMany({ orderBy: { createdAt: "asc" } });
}

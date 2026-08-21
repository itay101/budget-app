import { prisma } from "@/lib/prisma";

/**
 * This is a single-user app (no auth yet) — everything hangs off one
 * budget. Get it, creating it on first run if it doesn't exist yet.
 */
export async function getOrCreateDefaultBudget() {
  const existing = await prisma.budget.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return prisma.budget.create({ data: { name: "My Budget" } });
}

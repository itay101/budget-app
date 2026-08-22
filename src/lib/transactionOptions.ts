import { prisma } from "@/lib/prisma";

/**
 * The category-group and payee-name lists used to populate the "editable
 * cell" controls (category <select>, payee <datalist>) on any transaction
 * table — shared by the single-account page and the all-accounts page so
 * they stay in sync.
 */
export async function getTransactionEditOptions(budgetId: string) {
  const [categoryGroups, payees] = await Promise.all([
    prisma.categoryGroup.findMany({
      where: { budgetId },
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
    prisma.payee.findMany({
      where: { budgetId },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  return {
    categoryGroups: categoryGroups.map((group) => ({
      id: group.id,
      name: group.name,
      categories: group.categories,
    })),
    payeeNames: payees.map((p) => p.name),
  };
}

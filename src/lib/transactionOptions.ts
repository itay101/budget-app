import { prisma } from "@/lib/prisma";

/**
 * For each payee in the budget, the categoryId of that payee's most recent
 * transaction that has a category set (#88) — keyed by payee name, since
 * that's how TransactionsTable's payee field is edited (a plain text input
 * against a `payeeNames` datalist, not a payeeId select). Payees with no
 * categorized transaction yet are simply absent from the map.
 *
 * "Most recent" is by transaction date, ties broken by createdAt — the
 * `DISTINCT ON` groups by name rather than payeeId so it lines up with that
 * same by-name lookup on the client; `findOrCreatePayee` already treats a
 * budget's payee names as unique in practice (see its own comment), so
 * grouping by name here doesn't lose anything grouping by payeeId would
 * have kept.
 */
async function getPayeeLastCategories(
  budgetId: string,
): Promise<Record<string, string>> {
  const rows = await prisma.$queryRaw<{ name: string; categoryId: string }[]>`
    SELECT DISTINCT ON (p.name) p.name AS name, t."categoryId" AS "categoryId"
    FROM "Transaction" t
    JOIN "Payee" p ON p.id = t."payeeId"
    JOIN "Account" a ON a.id = t."accountId"
    WHERE a."budgetId" = ${budgetId} AND t."categoryId" IS NOT NULL
    ORDER BY p.name, t.date DESC, t."createdAt" DESC
  `;

  return Object.fromEntries(rows.map((r) => [r.name, r.categoryId]));
}

/**
 * The category-group and payee-name lists used to populate the "editable
 * cell" controls (category <select>, payee <datalist>) on any transaction
 * table — shared by the single-account page and the all-accounts page so
 * they stay in sync. Also includes payeeLastCategory (#88), the same
 * per-payee default-category lookup, so the table can auto-fill a row's
 * category as soon as its payee is set.
 */
export async function getTransactionEditOptions(budgetId: string) {
  const [categoryGroups, payees, payeeLastCategory] = await Promise.all([
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
    getPayeeLastCategories(budgetId),
  ]);

  return {
    categoryGroups: categoryGroups.map((group) => ({
      id: group.id,
      name: group.name,
      categories: group.categories,
    })),
    payeeNames: payees.map((p) => p.name),
    payeeLastCategory,
  };
}

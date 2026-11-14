import type { CategoryGroupSystemKind, CategorySystemKind, Prisma } from "@prisma/client";
import { diffFields, recordAuditEntries } from "./audit";

/**
 * The system-owned category rows every Budget has (ADR 0008): one
 * "Inflow" group holding one "Inflow: Ready to Assign" category. Only
 * on-budget transactions in that category count as Ready to Assign
 * income. Both rows carry a `systemKind`, so nothing here relies on
 * their names, which are only the labels shown in pickers.
 */
const INFLOW_GROUP_NAME = "Inflow";
const READY_TO_ASSIGN_CATEGORY_NAME = "Inflow: Ready to Assign";

/**
 * Seeds the Inflow group and its Inflow: Ready to Assign category in a
 * freshly created budget, on the caller's `tx`, with their creation
 * AuditEntries (ADR 0002). Existing budgets got theirs from the
 * 20261114120000_add_inflow_ready_to_assign_category migration.
 */
export async function seedSystemCategories(
  tx: Prisma.TransactionClient,
  { budgetId, actorId }: { budgetId: string; actorId: string },
): Promise<void> {
  const group = await tx.categoryGroup.create({
    data: { budgetId, name: INFLOW_GROUP_NAME, sortOrder: -1, systemKind: "INFLOW" },
  });
  const category = await tx.category.create({
    data: {
      categoryGroupId: group.id,
      name: READY_TO_ASSIGN_CATEGORY_NAME,
      sortOrder: 0,
      systemKind: "READY_TO_ASSIGN",
    },
  });
  await recordAuditEntries(tx, [
    {
      budgetId,
      entityType: "CATEGORY_GROUP",
      entityId: group.id,
      action: "created",
      actorId,
      changes: diffFields({}, { name: group.name, sortOrder: group.sortOrder, systemKind: "INFLOW" }),
    },
    {
      budgetId,
      entityType: "CATEGORY",
      entityId: category.id,
      action: "created",
      actorId,
      changes: diffFields(
        {},
        {
          categoryGroupId: group.id,
          name: category.name,
          sortOrder: category.sortOrder,
          systemKind: "READY_TO_ASSIGN",
        },
      ),
    },
  ]);
}

/** The budget's Inflow: Ready to Assign category id. Every budget has one. */
export async function readyToAssignCategoryId(
  db: Prisma.TransactionClient,
  budgetId: string,
): Promise<string> {
  const category = await db.category.findFirstOrThrow({
    where: { systemKind: "READY_TO_ASSIGN", categoryGroup: { budgetId } },
    select: { id: true },
  });
  return category.id;
}

/**
 * Refuses an edit to a system group or category: renaming, hiding,
 * moving, deleting, assigning to or targeting it, or adding categories
 * to its group. Pass the row's `systemKind`, which
 * requireCategoryAccess/requireCategoryGroupAccess return.
 */
export function assertNotSystem(
  systemKind: CategorySystemKind | CategoryGroupSystemKind | null | undefined,
): void {
  if (systemKind) {
    throw new Error(`${READY_TO_ASSIGN_CATEGORY_NAME} can't be changed`);
  }
}

/** What categoryUsableError needs to know about the category a transaction
 * is being given. Null means no category row with that id exists. */
export type CategoryForTransaction = {
  budgetId: string;
  systemKind: CategorySystemKind | null;
} | null;

/**
 * Why a transaction can't use this category, or null when it can. The
 * category must belong to the transaction's budget, and Inflow: Ready to
 * Assign only makes sense on an on-budget account, since off-budget
 * accounts never count as income (ADR 0008).
 */
export function categoryUsableError(
  category: CategoryForTransaction,
  { budgetId, accountOnBudget }: { budgetId: string; accountOnBudget: boolean },
): string | null {
  if (!category || category.budgetId !== budgetId) return "Category not found";
  if (category.systemKind === "READY_TO_ASSIGN" && !accountOnBudget) {
    return `${READY_TO_ASSIGN_CATEGORY_NAME} can only be used on an on-budget account`;
  }
  return null;
}

/** Loads the category and the account it's going on, and throws
 * categoryUsableError's reason, if any. A null categoryId (uncategorized)
 * is always allowed. */
export async function assertCategoryUsable(
  db: Prisma.TransactionClient,
  categoryId: string | null,
  { budgetId, accountId }: { budgetId: string; accountId: string },
): Promise<void> {
  if (categoryId === null) return;
  const [row, account] = await Promise.all([
    db.category.findUnique({
      where: { id: categoryId },
      select: { systemKind: true, categoryGroup: { select: { budgetId: true } } },
    }),
    db.account.findUniqueOrThrow({ where: { id: accountId }, select: { onBudget: true } }),
  ]);
  const error = categoryUsableError(
    row && { budgetId: row.categoryGroup.budgetId, systemKind: row.systemKind },
    { budgetId, accountOnBudget: account.onBudget },
  );
  if (error) throw new Error(error);
}

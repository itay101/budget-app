"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { getCurrentUser } from "@/lib/auth";
import {
  requireCategoryAccess,
  requireCategoryGroupAccess,
} from "@/lib/authorization";
import {
  auditedCreate,
  auditedDelete,
  auditedUpdate,
  diffFields,
  recordAuditEntry,
} from "@/lib/audit";
import { numberToMilliunits } from "@/lib/money";

/**
 * Creates a new category group, appended after every existing group in
 * this budget's sort order.
 */
export async function createCategoryGroup(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    throw new Error("Category group name is required");
  }

  const budget = await getCurrentBudget();
  const user = await getCurrentUser();

  const last = await prisma.categoryGroup.findFirst({
    where: { budgetId: budget.id },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  await prisma.$transaction((tx) =>
    auditedCreate({
      tx,
      budgetId: budget.id,
      entityType: "CATEGORY_GROUP",
      actorId: user.id,
      apply: () =>
        tx.categoryGroup.create({
          data: { budgetId: budget.id, name, sortOrder },
        }),
      entityId: (group) => group.id,
      fields: () => ({ name, sortOrder }),
    }),
  );

  revalidatePath("/budget");
}

/**
 * Creates a new category in the given group, appended after every existing
 * category in that group's sort order.
 */
export async function createCategory(formData: FormData) {
  const categoryGroupId = String(formData.get("categoryGroupId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!categoryGroupId || !name) {
    throw new Error("Category group and name are required");
  }
  const { user, budgetId } = await requireCategoryGroupAccess(categoryGroupId);

  const last = await prisma.category.findFirst({
    where: { categoryGroupId },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  await prisma.$transaction((tx) =>
    auditedCreate({
      tx,
      budgetId,
      entityType: "CATEGORY",
      actorId: user.id,
      apply: () =>
        tx.category.create({
          data: { categoryGroupId, name, sortOrder },
        }),
      entityId: (category) => category.id,
      fields: () => ({ categoryGroupId, name, sortOrder }),
    }),
  );

  revalidatePath("/budget");
}

/**
 * Renames a category group using the trimmed name from `formData`. An unchanged
 * name is a no-op; a successful rename is audited and revalidates the budget.
 */
export async function renameCategoryGroup(formData: FormData) {
  const categoryGroupId = String(formData.get("categoryGroupId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!categoryGroupId) {
    throw new Error("categoryGroupId is required");
  }
  if (!name) {
    throw new Error("Category group name is required");
  }
  const { user, budgetId } = await requireCategoryGroupAccess(categoryGroupId);

  const before = await prisma.categoryGroup.findUniqueOrThrow({
    where: { id: categoryGroupId },
    select: { name: true },
  });
  if (name === before.name) {
    return;
  }

  await prisma.$transaction((tx) =>
    auditedUpdate({
      tx,
      budgetId,
      entityType: "CATEGORY_GROUP",
      entityId: categoryGroupId,
      actorId: user.id,
      before,
      after: { name },
      apply: () => tx.categoryGroup.update({ where: { id: categoryGroupId }, data: { name } }),
    }),
  );

  revalidatePath("/budget");
}

/**
 * Renames a category using the trimmed name from `formData`. An unchanged name
 * is a no-op; a successful rename is audited and revalidates the budget.
 */
export async function renameCategory(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!categoryId) {
    throw new Error("categoryId is required");
  }
  if (!name) {
    throw new Error("Category name is required");
  }
  const { user, budgetId } = await requireCategoryAccess(categoryId);

  const before = await prisma.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { name: true },
  });
  if (name === before.name) {
    return;
  }

  await prisma.$transaction((tx) =>
    auditedUpdate({
      tx,
      budgetId,
      entityType: "CATEGORY",
      entityId: categoryId,
      actorId: user.id,
      before,
      after: { name },
      apply: () => tx.category.update({ where: { id: categoryId }, data: { name } }),
    }),
  );

  revalidatePath("/budget");
}

/**
 * Sets whether a category appears in the synthetic "Hidden" section without
 * changing its category group or sort order, so unhiding restores its original
 * position. An unchanged state is a no-op; a successful change is audited and
 * revalidates the budget.
 */
export async function setCategoryHidden(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "");
  const hidden = String(formData.get("hidden") ?? "") === "true";

  if (!categoryId) {
    throw new Error("categoryId is required");
  }
  const { user, budgetId } = await requireCategoryAccess(categoryId);

  const before = await prisma.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { hidden: true },
  });
  if (hidden === before.hidden) {
    return;
  }

  await prisma.$transaction((tx) =>
    auditedUpdate({
      tx,
      budgetId,
      entityType: "CATEGORY",
      entityId: categoryId,
      actorId: user.id,
      before,
      after: { hidden },
      apply: () => tx.category.update({ where: { id: categoryId }, data: { hidden } }),
    }),
  );

  revalidatePath("/budget");
}

/**
 * Deletes a category group. Only allowed once it's empty — deleting a
 * nonempty group would otherwise silently orphan its categories.
 */
export async function deleteCategoryGroup(formData: FormData) {
  const categoryGroupId = String(formData.get("categoryGroupId") ?? "");

  if (!categoryGroupId) {
    throw new Error("categoryGroupId is required");
  }
  const { user, budgetId } = await requireCategoryGroupAccess(categoryGroupId);

  const categoryCount = await prisma.category.count({
    where: { categoryGroupId },
  });
  if (categoryCount > 0) {
    throw new Error("Only empty category groups can be deleted");
  }

  const before = await prisma.categoryGroup.findUniqueOrThrow({
    where: { id: categoryGroupId },
    select: { name: true, sortOrder: true },
  });

  await prisma.$transaction((tx) =>
    auditedDelete({
      tx,
      budgetId,
      entityType: "CATEGORY_GROUP",
      entityId: categoryGroupId,
      actorId: user.id,
      before,
      apply: () => tx.categoryGroup.delete({ where: { id: categoryGroupId } }),
    }),
  );

  revalidatePath("/budget");
}

// Drag-and-drop reorder/move: a category can be dragged to a new position
// within its group, or dropped into a different group entirely. Both are
// the same operation — place it in `targetGroupId`, immediately before
// `beforeCategoryId` (or at the end, if that's omitted) — so one action
// covers both. Rather than juggle fractional sort keys, the whole target
// group's order is recomputed and renumbered 0..n on every move; a
// personal budget's category groups are small enough that this is cheap.
export async function moveCategory(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "");
  const targetGroupId = String(formData.get("targetGroupId") ?? "");
  const beforeCategoryId =
    String(formData.get("beforeCategoryId") ?? "") || null;

  if (!categoryId || !targetGroupId) {
    throw new Error("categoryId and targetGroupId are required");
  }
  if (categoryId === beforeCategoryId) {
    return;
  }

  const [
    { user, budgetId: sourceBudgetId },
    { budgetId: targetBudgetId },
  ] = await Promise.all([
    requireCategoryAccess(categoryId),
    requireCategoryGroupAccess(targetGroupId),
  ]);
  // Both ids are independently authorized above, but a move across
  // budgets would still corrupt data (a Category's budget is implied by
  // its CategoryGroup) even between two budgets the same user can
  // access — e.g. two of their own budgets, or one they own and one they
  // collaborate on.
  if (sourceBudgetId !== targetBudgetId) {
    throw new Error("Cannot move a category to a different budget");
  }

  const movedBefore = await prisma.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { categoryGroupId: true, sortOrder: true },
  });

  const targetCategories = await prisma.category.findMany({
    where: { categoryGroupId: targetGroupId, id: { not: categoryId } },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  const insertAt = beforeCategoryId
    ? targetCategories.findIndex((c) => c.id === beforeCategoryId)
    : -1;
  const ordered =
    insertAt === -1
      ? [...targetCategories, { id: categoryId }]
      : [
          ...targetCategories.slice(0, insertAt),
          { id: categoryId },
          ...targetCategories.slice(insertAt),
        ];
  const movedSortOrder = ordered.findIndex((c) => c.id === categoryId);

  await prisma.$transaction((tx) =>
    // Only the dragged category's move is a substantive audit-worthy
    // change — the rest of `ordered` just gets renumbered `sortOrder` as
    // a side effect of making room for it, which isn't its own
    // meaningful event.
    auditedUpdate({
      tx,
      budgetId: sourceBudgetId,
      entityType: "CATEGORY",
      entityId: categoryId,
      actorId: user.id,
      before: movedBefore,
      after: { categoryGroupId: targetGroupId, sortOrder: movedSortOrder },
      apply: () =>
        Promise.all(
          ordered.map((c, index) =>
            tx.category.update({
              where: { id: c.id },
              data: { sortOrder: index, categoryGroupId: targetGroupId },
            }),
          ),
        ),
    }),
  );

  revalidatePath("/budget");
}

export async function transferAvailable(formData: FormData) {
  const fromCategoryId = String(formData.get("fromCategoryId") ?? "");
  const toCategoryId = String(formData.get("toCategoryId") ?? "");
  const monthInput = String(formData.get("month") ?? "");
  const amountInput = String(formData.get("amount") ?? "0");

  if (!fromCategoryId || !toCategoryId || !monthInput) {
    throw new Error("fromCategoryId, toCategoryId, and month are required");
  }
  if (fromCategoryId === toCategoryId) {
    throw new Error("Cannot move money to the same category");
  }

  const [{ user, budgetId: fromBudgetId }, { budgetId: toBudgetId }] =
    await Promise.all([
      requireCategoryAccess(fromCategoryId),
      requireCategoryAccess(toCategoryId),
    ]);
  if (fromBudgetId !== toBudgetId) {
    throw new Error("Cannot move money between different budgets");
  }

  const month = new Date(monthInput);
  const amount = numberToMilliunits(Number(amountInput) || 0);

  if (amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const [fromBefore, toBefore] = await Promise.all([
    prisma.categoryMonth.findUnique({
      where: { categoryId_month: { categoryId: fromCategoryId, month } },
      select: { budgeted: true },
    }),
    prisma.categoryMonth.findUnique({
      where: { categoryId_month: { categoryId: toCategoryId, month } },
      select: { budgeted: true },
    }),
  ]);

  // A transfer just shifts `budgeted` between the two categories for this
  // month — activity is untouched, so the two "available" figures move by
  // the same amount in opposite directions. Deliberately unguarded against
  // the source going negative: moving money out of an already-overspent
  // category (or past zero into one) is a normal, allowed move here, not
  // an error.
  await prisma.$transaction(async (tx) => {
    const from = await tx.categoryMonth.upsert({
      where: { categoryId_month: { categoryId: fromCategoryId, month } },
      create: { categoryId: fromCategoryId, month, budgeted: -amount },
      update: { budgeted: { decrement: amount } },
    });
    const to = await tx.categoryMonth.upsert({
      where: { categoryId_month: { categoryId: toCategoryId, month } },
      create: { categoryId: toCategoryId, month, budgeted: amount },
      update: { budgeted: { increment: amount } },
    });
    await recordAuditEntry(tx, {
      budgetId: fromBudgetId,
      entityType: "CATEGORY_MONTH",
      entityId: from.id,
      action: "updated",
      actorId: user.id,
      changes: diffFields({ budgeted: fromBefore?.budgeted ?? 0 }, { budgeted: from.budgeted }),
    });
    await recordAuditEntry(tx, {
      budgetId: fromBudgetId,
      entityType: "CATEGORY_MONTH",
      entityId: to.id,
      action: "updated",
      actorId: user.id,
      changes: diffFields({ budgeted: toBefore?.budgeted ?? 0 }, { budgeted: to.budgeted }),
    });
  });

  revalidatePath("/budget");
}

export async function setBudgeted(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "");
  const monthInput = String(formData.get("month") ?? "");
  const amountInput = String(formData.get("amount") ?? "0");

  if (!categoryId || !monthInput) {
    throw new Error("categoryId and month are required");
  }
  const { user, budgetId } = await requireCategoryAccess(categoryId);

  const month = new Date(monthInput);
  const budgeted = numberToMilliunits(Number(amountInput) || 0);

  const before = await prisma.categoryMonth.findUnique({
    where: { categoryId_month: { categoryId, month } },
    select: { budgeted: true },
  });
  if (before && before.budgeted === budgeted) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const categoryMonth = await tx.categoryMonth.upsert({
      where: { categoryId_month: { categoryId, month } },
      create: { categoryId, month, budgeted },
      update: { budgeted },
    });
    await recordAuditEntry(tx, {
      budgetId,
      entityType: "CATEGORY_MONTH",
      entityId: categoryMonth.id,
      action: "updated",
      actorId: user.id,
      changes: diffFields({ budgeted: before?.budgeted ?? 0 }, { budgeted }),
    });
  });

  revalidatePath("/budget");
}

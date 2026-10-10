"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBudget, requireNavigableMonth } from "@/lib/budget";
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
import { effectiveTarget, parseTargetInput, type Target } from "@/lib/targets";

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

  const month = await requireNavigableMonth(fromBudgetId, monthInput);
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

  const month = await requireNavigableMonth(budgetId, monthInput);
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

/** The category and viewed month every target action starts from,
 * authorized the same way setBudgeted is. */
async function requireTargetContext(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "");
  const monthInput = String(formData.get("month") ?? "");

  if (!categoryId || !monthInput) {
    throw new Error("categoryId and month are required");
  }
  const { user, budgetId } = await requireCategoryAccess(categoryId);
  const month = await requireNavigableMonth(budgetId, monthInput);
  return { categoryId, month, actorId: user.id, budgetId };
}

type TargetContext = Awaited<ReturnType<typeof requireTargetContext>>;

const TARGET_FIELDS = {
  kind: true,
  cadence: true,
  amount: true,
  weekday: true,
  dueDay: true,
  dueDate: true,
} as const;

function sameTarget(a: Target, b: Target): boolean {
  return (
    a.kind === b.kind &&
    a.cadence === b.cadence &&
    a.amount === b.amount &&
    a.weekday === b.weekday &&
    a.dueDay === b.dueDay &&
    a.dueDate?.getTime() === b.dueDate?.getTime()
  );
}

/** Upserts the target row starting at the viewed month (ADR 0011), so the
 * change applies from that month on and earlier months keep their rows.
 * Writing the target that's already there is a no-op. */
async function writeTargetRow({ categoryId, month, actorId, budgetId }: TargetContext, target: Target) {
  const before = await prisma.categoryTarget.findUnique({
    where: { categoryId_startMonth: { categoryId, startMonth: month } },
    select: { id: true, ...TARGET_FIELDS },
  });
  if (before && sameTarget(before, target)) {
    return;
  }

  await prisma.$transaction((tx) => {
    const audit = { tx, budgetId, entityType: "CATEGORY_TARGET" as const, actorId };
    if (before) {
      const { id, ...beforeFields } = before;
      return auditedUpdate({
        ...audit,
        entityId: id,
        before: beforeFields,
        after: { ...target },
        apply: () => tx.categoryTarget.update({ where: { id }, data: target }),
      });
    }
    return auditedCreate({
      ...audit,
      apply: () => tx.categoryTarget.create({ data: { categoryId, startMonth: month, ...target } }),
      entityId: (row) => row.id,
      fields: () => ({ categoryId, startMonth: month, ...target }),
    });
  });

  revalidatePath("/budget");
}

/** The target in effect for the category in the viewed month, if any. */
async function targetInEffect({ categoryId, month }: TargetContext): Promise<Target | null> {
  const rows = await prisma.categoryTarget.findMany({
    where: { categoryId, startMonth: { lte: month } },
    orderBy: { startMonth: "desc" },
    take: 1,
  });
  return effectiveTarget(rows, month);
}

/**
 * Sets a category's target from the viewed month on (#170). The form's
 * kind, cadence, amount and dates go through parseTargetInput, which
 * rejects incomplete targets.
 */
export async function setTarget(formData: FormData) {
  const context = await requireTargetContext(formData);
  const fields = ["kind", "cadence", "amount", "weekday", "dueDay", "dueDate", "dated", "dueMonth"] as const;
  const target = parseTargetInput(
    Object.fromEntries(fields.map((field) => [field, String(formData.get(field) ?? "")])),
  );
  await writeTargetRow(context, target);
}

/**
 * Removes a category's target from the viewed month on by writing a NONE
 * row there (ADR 0011); earlier months keep theirs. A no-op when no target
 * applies in that month.
 */
export async function removeTarget(formData: FormData) {
  const context = await requireTargetContext(formData);
  if (!(await targetInEffect(context))) {
    return;
  }
  await writeTargetRow(context, {
    kind: "NONE",
    cadence: null,
    amount: 0,
    weekday: null,
    dueDay: null,
    dueDate: null,
  });
}

/**
 * Snoozes the category's target for the viewed month only (ADR 0011): it
 * wakes up on its own the next month, and doesn't start a new target row.
 */
export async function snoozeTarget(formData: FormData) {
  const context = await requireTargetContext(formData);
  const { categoryId, month, actorId, budgetId } = context;

  if (!(await targetInEffect(context))) {
    throw new Error("This category has no target to snooze");
  }
  const existing = await prisma.categoryTargetSnooze.findUnique({
    where: { categoryId_month: { categoryId, month } },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  await prisma.$transaction((tx) =>
    auditedCreate({
      tx,
      budgetId,
      entityType: "CATEGORY_TARGET_SNOOZE",
      actorId,
      apply: () => tx.categoryTargetSnooze.create({ data: { categoryId, month } }),
      entityId: (snooze) => snooze.id,
      fields: () => ({ categoryId, month }),
    }),
  );

  revalidatePath("/budget");
}

/** Wakes a snoozed target for the viewed month. A no-op when it isn't
 * snoozed. */
export async function unsnoozeTarget(formData: FormData) {
  const { categoryId, month, actorId, budgetId } = await requireTargetContext(formData);

  const existing = await prisma.categoryTargetSnooze.findUnique({
    where: { categoryId_month: { categoryId, month } },
    select: { id: true },
  });
  if (!existing) {
    return;
  }

  await prisma.$transaction((tx) =>
    auditedDelete({
      tx,
      budgetId,
      entityType: "CATEGORY_TARGET_SNOOZE",
      entityId: existing.id,
      actorId,
      before: { categoryId, month },
      apply: () => tx.categoryTargetSnooze.delete({ where: { id: existing.id } }),
    }),
  );

  revalidatePath("/budget");
}

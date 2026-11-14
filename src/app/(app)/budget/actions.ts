"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getBudgetMonthRows, getCurrentBudget, requireNavigableMonth } from "@/lib/budget";
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
import { assertNotSystem } from "@/lib/systemCategories";
import { moveLegs } from "@/lib/readyToAssign";
import { isAutoAssignOption } from "@/lib/autoAssign";
import { currentBudgetMonth } from "@/lib/budgetMonth";

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
  const { user, budgetId, systemKind } = await requireCategoryGroupAccess(categoryGroupId);
  assertNotSystem(systemKind);

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
  const { user, budgetId, systemKind } = await requireCategoryGroupAccess(categoryGroupId);
  assertNotSystem(systemKind);

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
  const { user, budgetId, systemKind } = await requireCategoryAccess(categoryId);
  assertNotSystem(systemKind);

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
  const { user, budgetId, systemKind } = await requireCategoryAccess(categoryId);
  assertNotSystem(systemKind);

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
  const { user, budgetId, systemKind } = await requireCategoryGroupAccess(categoryGroupId);
  assertNotSystem(systemKind);

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
    { user, budgetId: sourceBudgetId, systemKind: categoryKind },
    { budgetId: targetBudgetId, systemKind: groupKind },
  ] = await Promise.all([
    requireCategoryAccess(categoryId),
    requireCategoryGroupAccess(targetGroupId),
  ]);
  // Inflow: Ready to Assign can't leave its group, and nothing can join it.
  assertNotSystem(categoryKind);
  assertNotSystem(groupKind);
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
  const amount = numberToMilliunits(Number(amountInput) || 0);
  if (amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }
  // Either side may be READY_TO_ASSIGN (#134, #217). Ready to Assign is
  // derived, so a move to or from it changes only the other category.
  const legs = moveLegs(fromCategoryId, toCategoryId, amount);

  // Ready to Assign itself is the sentinel, never the Inflow category's row.
  const { budgetId, actorId } = await requireAssignableCategories(
    legs.map((leg) => leg.categoryId),
    "Cannot move money between different budgets",
  );
  const month = await requireNavigableMonth(budgetId, monthInput);

  const before = await Promise.all(
    legs.map((leg) =>
      prisma.categoryMonth.findUnique({
        where: { categoryId_month: { categoryId: leg.categoryId, month } },
        select: { budgeted: true },
      }),
    ),
  );

  // A move only shifts `budgeted` for this month: activity is untouched,
  // so the Available figures (and Ready to Assign) move by the same amount
  // in opposite directions. Deliberately unguarded against a category or
  // Ready to Assign going negative: that's a normal, allowed move here
  // (#134), shown in red rather than refused.
  await prisma.$transaction(async (tx) => {
    for (const [i, { categoryId, delta }] of legs.entries()) {
      const row = await tx.categoryMonth.upsert({
        where: { categoryId_month: { categoryId, month } },
        create: { categoryId, month, budgeted: delta },
        update: { budgeted: { increment: delta } },
      });
      await recordAuditEntry(tx, {
        budgetId,
        entityType: "CATEGORY_MONTH",
        entityId: row.id,
        action: "updated",
        actorId,
        changes: diffFields({ budgeted: before[i]?.budgeted ?? 0 }, { budgeted: row.budgeted }),
      });
    }
  });

  revalidatePath("/budget");
}

export async function setBudgeted(formData: FormData) {
  const { categoryId, month, actorId, budgetId } = await requireCategoryMonth(formData);
  const budgeted = numberToMilliunits(Number(formData.get("amount") ?? "0") || 0);

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
      actorId,
      changes: diffFields({ budgeted: before?.budgeted ?? 0 }, { budgeted }),
    });
  });

  revalidatePath("/budget");
}

/** The category and viewed month setBudgeted and every target action
 * start from: authorized, refused for the system Inflow: Ready to Assign
 * category, and the month checked to be navigable. */
async function requireCategoryMonth(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "");
  const monthInput = String(formData.get("month") ?? "");

  if (!categoryId || !monthInput) {
    throw new Error("categoryId and month are required");
  }
  const { user, budgetId, systemKind } = await requireCategoryAccess(categoryId);
  assertNotSystem(systemKind);
  const month = await requireNavigableMonth(budgetId, monthInput);
  return { categoryId, month, actorId: user.id, budgetId };
}

type TargetContext = Awaited<ReturnType<typeof requireCategoryMonth>>;

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
  const context = await requireCategoryMonth(formData);
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
  const context = await requireCategoryMonth(formData);
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
  const context = await requireCategoryMonth(formData);
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
  const { categoryId, month, actorId, budgetId } = await requireCategoryMonth(formData);

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

/**
 * Authorizes every category money is assigned to or from: each must be
 * accessible, never the system Inflow: Ready to Assign category, and all
 * in one budget. Shared by Move Money and Auto-Assign.
 */
async function requireAssignableCategories(categoryIds: string[], acrossBudgets: string) {
  const access = await Promise.all(categoryIds.map((id) => requireCategoryAccess(id)));
  for (const { systemKind } of access) assertNotSystem(systemKind);
  const budgetId = access[0].budgetId;
  if (access.some((a) => a.budgetId !== budgetId)) throw new Error(acrossBudgets);
  return { budgetId, actorId: access[0].user.id };
}

/** One previewed Auto-Assign change, as the client sends it back. */
interface AssignedRow {
  categoryId: string;
  from: number;
  to: number;
}

export interface AutoAssignResult {
  /** The rows applied, so the run can be undone. */
  applied: AssignedRow[];
  /** Rows whose Assigned had changed since the preview, left alone. */
  skipped: string[];
}

/** Reads and checks `rows` (JSON of AssignedRow[]) from the form. */
function parseAssignedRows(formData: FormData): AssignedRow[] {
  const raw: unknown = JSON.parse(String(formData.get("rows") ?? "[]"));
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("rows are required");
  return raw.map((row) => {
    const { categoryId, from, to } = row as Record<string, unknown>;
    if (typeof categoryId !== "string" || !Number.isInteger(from) || !Number.isInteger(to)) {
      throw new Error("Each row needs a categoryId and integer from/to amounts");
    }
    return { categoryId, from: from as number, to: to as number };
  });
}

/** The option, month and rows an Auto-Assign or its undo acts on, with
 * every category authorized, never a system one, all in one budget. */
async function requireAutoAssignContext(formData: FormData) {
  const optionInput = String(formData.get("option") ?? "");
  if (!isAutoAssignOption(optionInput)) throw new Error("Unknown Auto-Assign option");
  const rows = parseAssignedRows(formData);
  const { budgetId, actorId } = await requireAssignableCategories(
    rows.map((row) => row.categoryId),
    "Cannot Auto-Assign across different budgets",
  );
  const month = await requireNavigableMonth(budgetId, String(formData.get("month") ?? ""));
  return { option: optionInput, rows, budgetId, month, actorId };
}

/**
 * Applies each row only if the category's Assigned still equals `from`, so
 * an edit made since the preview is never overwritten (#147), and writes
 * one CATEGORY_MONTH audit entry per applied row, all in one transaction.
 * `maxNet`, when given, caps what the rows that do apply may add in total;
 * going over rolls the whole run back.
 */
async function applyAssignedRows(
  { option, rows, budgetId, month, actorId }: Awaited<ReturnType<typeof requireAutoAssignContext>>,
  action: string,
  maxNet?: number,
): Promise<AutoAssignResult> {
  const result: AutoAssignResult = { applied: [], skipped: [] };
  await prisma.$transaction(async (tx) => {
    const applicable: AssignedRow[] = [];
    for (const row of rows) {
      const current = await tx.categoryMonth.findUnique({
        where: { categoryId_month: { categoryId: row.categoryId, month } },
        select: { budgeted: true },
      });
      if ((current?.budgeted ?? 0) === row.from) applicable.push(row);
      else result.skipped.push(row.categoryId);
    }
    // Only rows that will actually change count against Ready to Assign: an
    // edited row is skipped, not a reason to refuse the rest (#219).
    const net = applicable.reduce((sum, row) => sum + row.to - row.from, 0);
    if (maxNet !== undefined && net > 0 && net > maxNet) {
      throw new Error("Not enough Ready to Assign for this Auto-Assign. Refresh and try again");
    }
    for (const row of applicable) {
      const where = { categoryId_month: { categoryId: row.categoryId, month } };
      const saved = await tx.categoryMonth.upsert({
        where,
        create: { categoryId: row.categoryId, month, budgeted: row.to },
        update: { budgeted: row.to },
      });
      await recordAuditEntry(tx, {
        budgetId,
        entityType: "CATEGORY_MONTH",
        entityId: saved.id,
        action,
        actorId,
        changes: { budgeted: [row.from, row.to], option: [null, option] },
      });
      result.applied.push(row);
    }
  });
  revalidatePath("/budget");
  return result;
}

/**
 * Confirms an Auto-Assign run (#147, #219): the previewed `rows` for one
 * option in the viewed month. A run that adds money is re-checked against
 * Ready to Assign, which it may use up but never overdraw. A past month
 * only takes runs that add nothing for now; adding money there, which must
 * keep every later month at $0 or more (#163), comes with the remaining
 * options.
 */
export async function autoAssign(formData: FormData): Promise<AutoAssignResult> {
  const context = await requireAutoAssignContext(formData);
  if (!context.rows.some((row) => row.to > row.from)) return applyAssignedRows(context, "auto-assigned");
  if (context.month.getTime() < currentBudgetMonth().getTime()) {
    throw new Error("Auto-Assign can't add money in a past month yet");
  }
  // Ready to Assign as it is now, edits since the preview included; the
  // transaction then checks only the rows that still apply against it.
  const { readyToAssign } = await getBudgetMonthRows(context.budgetId, context.month);
  return applyAssignedRows(context, "auto-assigned", readyToAssign.total);
}

/** Undoes a confirmed run: the same rows, back from `to` to `from`, each
 * only if it still holds what the run set (#147). Like Move Money, an undo
 * may leave Ready to Assign negative. */
export async function undoAutoAssign(formData: FormData): Promise<AutoAssignResult> {
  const context = await requireAutoAssignContext(formData);
  const reversed = context.rows.map((row) => ({ categoryId: row.categoryId, from: row.to, to: row.from }));
  const result = await applyAssignedRows({ ...context, rows: reversed }, "auto-assign undone");
  return { ...result, applied: result.applied.map((row) => ({ ...row, from: row.to, to: row.from })) };
}


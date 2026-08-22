"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { numberToMilliunits } from "@/lib/money";

export async function createCategoryGroup(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    throw new Error("Category group name is required");
  }

  const budget = await getCurrentBudget();

  const last = await prisma.categoryGroup.findFirst({
    where: { budgetId: budget.id },
    orderBy: { sortOrder: "desc" },
  });

  await prisma.categoryGroup.create({
    data: {
      budgetId: budget.id,
      name,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/budget");
}

export async function createCategory(formData: FormData) {
  const categoryGroupId = String(formData.get("categoryGroupId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!categoryGroupId || !name) {
    throw new Error("Category group and name are required");
  }

  const last = await prisma.category.findFirst({
    where: { categoryGroupId },
    orderBy: { sortOrder: "desc" },
  });

  await prisma.category.create({
    data: {
      categoryGroupId,
      name,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/budget");
}

export async function renameCategoryGroup(formData: FormData) {
  const categoryGroupId = String(formData.get("categoryGroupId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!categoryGroupId) {
    throw new Error("categoryGroupId is required");
  }
  if (!name) {
    throw new Error("Category group name is required");
  }

  await prisma.categoryGroup.update({
    where: { id: categoryGroupId },
    data: { name },
  });

  revalidatePath("/budget");
}

export async function renameCategory(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!categoryId) {
    throw new Error("categoryId is required");
  }
  if (!name) {
    throw new Error("Category name is required");
  }

  await prisma.category.update({
    where: { id: categoryId },
    data: { name },
  });

  revalidatePath("/budget");
}

export async function deleteCategoryGroup(formData: FormData) {
  const categoryGroupId = String(formData.get("categoryGroupId") ?? "");

  if (!categoryGroupId) {
    throw new Error("categoryGroupId is required");
  }

  const categoryCount = await prisma.category.count({
    where: { categoryGroupId },
  });
  if (categoryCount > 0) {
    throw new Error("Only empty category groups can be deleted");
  }

  await prisma.categoryGroup.delete({ where: { id: categoryGroupId } });

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

  await prisma.$transaction(
    ordered.map((c, index) =>
      prisma.category.update({
        where: { id: c.id },
        data: { sortOrder: index, categoryGroupId: targetGroupId },
      }),
    ),
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

  const month = new Date(monthInput);
  const amount = numberToMilliunits(Number(amountInput) || 0);

  if (amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  // A transfer just shifts `budgeted` between the two categories for this
  // month — activity is untouched, so the two "available" figures move by
  // the same amount in opposite directions. Deliberately unguarded against
  // the source going negative: moving money out of an already-overspent
  // category (or past zero into one) is a normal, allowed move here, not
  // an error.
  await prisma.$transaction([
    prisma.categoryMonth.upsert({
      where: { categoryId_month: { categoryId: fromCategoryId, month } },
      create: { categoryId: fromCategoryId, month, budgeted: -amount },
      update: { budgeted: { decrement: amount } },
    }),
    prisma.categoryMonth.upsert({
      where: { categoryId_month: { categoryId: toCategoryId, month } },
      create: { categoryId: toCategoryId, month, budgeted: amount },
      update: { budgeted: { increment: amount } },
    }),
  ]);

  revalidatePath("/budget");
}

export async function setBudgeted(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "");
  const monthInput = String(formData.get("month") ?? "");
  const amountInput = String(formData.get("amount") ?? "0");

  if (!categoryId || !monthInput) {
    throw new Error("categoryId and month are required");
  }

  const month = new Date(monthInput);
  const budgeted = numberToMilliunits(Number(amountInput) || 0);

  await prisma.categoryMonth.upsert({
    where: { categoryId_month: { categoryId, month } },
    create: { categoryId, month, budgeted },
    update: { budgeted },
  });

  revalidatePath("/budget");
}

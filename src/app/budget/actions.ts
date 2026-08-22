"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBudget } from "@/lib/budget";
import { numberToMilliunits } from "@/lib/money";

export async function createCategoryGroup(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    throw new Error("Category group name is required");
  }

  const budget = await getOrCreateDefaultBudget();

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

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

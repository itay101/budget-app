"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { numberToMilliunits } from "@/lib/money";

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

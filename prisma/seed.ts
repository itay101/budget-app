import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

async function main() {
  const budget = await prisma.budget.create({
    data: { name: "My Budget" },
  });

  const checking = await prisma.account.create({
    data: {
      budgetId: budget.id,
      name: "Checking",
      type: "CHECKING",
      balance: 1_500_000, // $1,500.00
    },
  });

  const creditCard = await prisma.account.create({
    data: {
      budgetId: budget.id,
      name: "Credit Card",
      type: "CREDIT_CARD",
      onBudget: false,
      balance: -250_000, // -$250.00
    },
  });

  const groceries = await prisma.payee.create({
    data: { budgetId: budget.id, name: "Grocery Store" },
  });

  const immediateObligations = await prisma.categoryGroup.create({
    data: {
      budgetId: budget.id,
      name: "Immediate Obligations",
      sortOrder: 0,
      categories: {
        create: [
          { name: "Rent/Mortgage", sortOrder: 0 },
          { name: "Groceries", sortOrder: 1 },
          { name: "Utilities", sortOrder: 2 },
        ],
      },
    },
    include: { categories: true },
  });

  const groceriesCategory = immediateObligations.categories.find(
    (c) => c.name === "Groceries",
  )!;

  const month = startOfMonth(new Date());

  await prisma.categoryMonth.createMany({
    data: immediateObligations.categories.map((category, i) => ({
      categoryId: category.id,
      month,
      budgeted: [1_200_000, 500_000, 150_000][i] ?? 0,
    })),
  });

  await prisma.transaction.create({
    data: {
      accountId: checking.id,
      payeeId: groceries.id,
      categoryId: groceriesCategory.id,
      date: new Date(),
      amount: -84_990, // -$84.99
      memo: "Weekly shop",
      cleared: "CLEARED",
    },
  });

  console.log(`Seeded budget "${budget.name}" with accounts:`, [
    checking.name,
    creditCard.name,
  ]);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

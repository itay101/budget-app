import { PrismaClient } from "@prisma/client";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

const prisma = new PrismaClient();

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// A fixed id/email so re-running the seed against a non-empty database
// (unlike db:e2e:reset, which always starts from a fresh schema) reuses
// the same seed User instead of piling up duplicates. No real Supabase
// credentials back this row — nothing at the database level requires
// that (see docs/adr/0005/0006) — so local seeding doesn't need a live
// Supabase project at all. Shared with e2e's login shortcut (#72) — it's
// the one user every e2e test runs as, via prisma/seed.ts's own run as
// part of db:e2e:reset.
const SEED_USER_ID = E2E_TEST_USER_ID;

async function main() {
  const owner = await prisma.user.upsert({
    where: { id: SEED_USER_ID },
    create: { id: SEED_USER_ID, email: "seed@example.com" },
    update: {},
  });

  const budget = await prisma.budget.create({
    data: { name: "My Budget", ownerId: owner.id },
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

  const startingBalance = await prisma.payee.create({
    data: { budgetId: budget.id, name: "Starting Balance" },
  });

  // Starting-balance transactions, so each account's transaction list sums
  // to its cached balance instead of the balance being an unexplained
  // number with nothing behind it. Checking's is offset by the grocery
  // purchase below so the account still ends up at $1,500.00.
  await prisma.transaction.createMany({
    data: [
      {
        accountId: checking.id,
        payeeId: startingBalance.id,
        date: new Date(),
        amount: 1_584_990,
        memo: "Starting balance",
        cleared: "RECONCILED",
      },
      {
        accountId: creditCard.id,
        payeeId: startingBalance.id,
        date: new Date(),
        amount: -250_000,
        memo: "Starting balance",
        cleared: "RECONCILED",
      },
    ],
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

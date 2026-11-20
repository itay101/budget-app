import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

/**
 * Hard deletes that reach a still-linked Transfer row (ADR 0007). The app
 * clears both links before it deletes, so these only happen in cleanup
 * code like other specs' afterAll hooks, or an Account/Budget cascade. The
 * delete trigger removes the counterpart and takes its amount out of its
 * Account's cached balance.
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
const BUDGET_NAME = "E2E Transfer Hard Delete";
// Budgets are unique per owner and currency. No other spec uses NOK.
const CURRENCY = "NOK";

async function createTransferBudget() {
  // A failed earlier test can leave this budget behind; start clean.
  await prisma.budget.deleteMany({ where: { ownerId: E2E_TEST_USER_ID, currency: CURRENCY } });
  const budget = await prisma.budget.create({
    data: { name: BUDGET_NAME, currency: CURRENCY, ownerId: E2E_TEST_USER_ID },
  });
  const [checking, savings] = await Promise.all([
    prisma.account.create({ data: { budgetId: budget.id, name: "Checking", balance: -50_000 } }),
    prisma.account.create({ data: { budgetId: budget.id, name: "Savings", balance: 50_000 } }),
  ]);
  const date = new Date("2026-11-01T00:00:00Z");
  // The foreign key is deferred, so both links can be set in one transaction.
  const [outflow, inflow] = await prisma.$transaction(async (tx) => {
    const out = await tx.transaction.create({ data: { accountId: checking.id, date, amount: -50_000 } });
    const into = await tx.transaction.create({
      data: { accountId: savings.id, date, amount: 50_000, transferTransactionId: out.id },
    });
    await tx.transaction.update({ where: { id: out.id }, data: { transferTransactionId: into.id } });
    return [out, into];
  });
  return { budget, checking, savings, outflow, inflow };
}

test.describe("hard-deleting a transfer", () => {
  test.afterAll(async () => {
    await prisma.budget.deleteMany({ where: { ownerId: E2E_TEST_USER_ID, currency: CURRENCY } });
    await prisma.$disconnect();
  });

  test("deleting one side deletes the other and fixes its account's balance", async () => {
    const { budget, savings, outflow, inflow } = await createTransferBudget();

    await prisma.transaction.delete({ where: { id: outflow.id } });

    expect(await prisma.transaction.findUnique({ where: { id: inflow.id } })).toBeNull();
    expect((await prisma.account.findUniqueOrThrow({ where: { id: savings.id } })).balance).toBe(0);
    await prisma.budget.delete({ where: { id: budget.id } });
  });

  test("deleting an account deletes the other side in the other account", async () => {
    const { budget, checking, savings, inflow } = await createTransferBudget();

    await prisma.account.delete({ where: { id: checking.id } });

    expect(await prisma.transaction.findUnique({ where: { id: inflow.id } })).toBeNull();
    expect((await prisma.account.findUniqueOrThrow({ where: { id: savings.id } })).balance).toBe(0);
    await prisma.budget.delete({ where: { id: budget.id } });
  });

  test("deleting a budget with a transfer removes both sides", async () => {
    const { budget, outflow, inflow } = await createTransferBudget();

    await prisma.budget.delete({ where: { id: budget.id } });

    expect(await prisma.transaction.count({ where: { id: { in: [outflow.id, inflow.id] } } })).toBe(0);
  });
});

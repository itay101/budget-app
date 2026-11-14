import { createAccount, createTransaction, updateTransaction } from "@/app/(app)/accounts/actions";
import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { getCurrentUser } from "@/lib/auth";
import { requireAccountAccess, requireBudgetAccess } from "@/lib/authorization";
import { assertCategoryUsable, readyToAssignCategoryId } from "@/lib/systemCategories";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/budget", () => ({ getCurrentBudget: jest.fn() }));
jest.mock("@/lib/authorization", () => ({
  accessibleBudgetWhere: jest.fn(),
  requireAccountAccess: jest.fn(),
  requireBudgetAccess: jest.fn(),
  requireTransactionAccess: jest.fn(),
}));
jest.mock("@/lib/systemCategories", () => ({
  assertCategoryUsable: jest.fn(),
  readyToAssignCategoryId: jest.fn(),
}));
jest.mock("./ledger", () => ({
  applyBalanceDelta: jest.fn(),
  applyBalanceDeltas: jest.fn(),
  findOrCreatePayee: jest.fn(() => Promise.resolve("payee-starting-balance")),
}));
// The audited* helpers run for real against this client, standing in for
// both `prisma` and the transaction's `tx`.
jest.mock("@/lib/prisma", () => ({
  prisma: {
    account: { create: jest.fn() },
    transaction: { create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
    auditEntry: { create: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const transactionCreate = jest.mocked(prisma.transaction.create);

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(assertCategoryUsable).mockReset().mockResolvedValue(undefined);
  jest.mocked(prisma.$transaction).mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  jest.mocked(getCurrentBudget).mockResolvedValue({ id: "budget-1" } as never);
  jest.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
  jest.mocked(readyToAssignCategoryId).mockResolvedValue("category-rta");
  jest.mocked(prisma.account.create).mockResolvedValue({ id: "account-1" } as never);
  transactionCreate.mockImplementation((({ data }: { data: object }) =>
    Promise.resolve({ id: "transaction-1", ...data })) as never);
});

describe("createAccount's Starting Balance (ADR 0008)", () => {
  it.each(["CHECKING", "SAVINGS", "CASH"])("is Inflow: Ready to Assign on an on-budget %s account", async (type) => {
    await createAccount(form({ name: "Bank", type, balance: "100" }));

    expect(readyToAssignCategoryId).toHaveBeenCalledWith(prisma, "budget-1");
    expect(transactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ categoryId: "category-rta", amount: 100_000, memo: "Starting balance" }),
    });
  });

  it.each(["CREDIT_CARD", "LINE_OF_CREDIT"])("stays uncategorized on a %s account", async (type) => {
    await createAccount(form({ name: "Card", type, balance: "-50" }));

    expect(readyToAssignCategoryId).not.toHaveBeenCalled();
    expect(transactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ categoryId: null, amount: -50_000 }),
    });
  });
});

describe("transaction category checks", () => {
  it("createTransaction checks the category against the account and its budget before writing", async () => {
    jest.mocked(requireAccountAccess).mockResolvedValue({ user: { id: "user-1" }, budgetId: "budget-1" } as never);
    jest.mocked(assertCategoryUsable).mockRejectedValue(new Error("refused"));

    await expect(
      createTransaction(form({ accountId: "account-1", date: "2026-11-14", categoryId: "category-rta", amount: "5" })),
    ).rejects.toThrow("refused");
    expect(assertCategoryUsable).toHaveBeenCalledWith(prisma, "category-rta", {
      budgetId: "budget-1",
      accountId: "account-1",
    });
    expect(transactionCreate).not.toHaveBeenCalled();
  });

  it("updateTransaction checks a changed category, and only then", async () => {
    jest.mocked(prisma.transaction.findUniqueOrThrow).mockResolvedValue({
      accountId: "account-1",
      amount: 1000,
      date: new Date(),
      payeeId: null,
      categoryId: null,
      memo: null,
      account: { budgetId: "budget-1" },
    } as never);
    jest.mocked(requireBudgetAccess).mockResolvedValue({ user: { id: "user-1" } } as never);

    await updateTransaction(form({ transactionId: "t-1", categoryId: "category-rta" }));
    expect(assertCategoryUsable).toHaveBeenCalledWith(prisma, "category-rta", {
      budgetId: "budget-1",
      accountId: "account-1",
    });

    jest.mocked(assertCategoryUsable).mockClear();
    await updateTransaction(form({ transactionId: "t-1", memo: "lunch" }));
    expect(assertCategoryUsable).not.toHaveBeenCalled();
  });
});

import { findTransferLinkCandidates, readNewTransaction } from "@/app/(app)/accounts/actions";
import { prisma } from "@/lib/prisma";
import { requireAccountAccess } from "@/lib/authorization";

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
  findOrCreatePayee: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    account: { findUnique: jest.fn() },
    transaction: { findMany: jest.fn() },
  },
}));

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("readNewTransaction", () => {
  it("requires an account and a date", () => {
    expect(() => readNewTransaction(form({}))).toThrow("accountId is required");
    expect(() => readNewTransaction(form({ accountId: "a" }))).toThrow("Date is required");
  });
});

describe("findTransferLinkCandidates", () => {
  it("returns the closest unlinked opposite amount and skips a starting balance", async () => {
    jest.mocked(requireAccountAccess).mockResolvedValue({ user: { id: "u" }, budgetId: "b" } as never);
    jest.mocked(prisma.transaction.findMany).mockResolvedValue([
      {
        id: "near",
        date: new Date("2026-11-18T00:00:00.000Z"),
        amount: 15_000,
        memo: "bank",
        transferTransactionId: null,
        payee: { name: "Online transfer" },
      },
      {
        id: "opening",
        date: new Date("2026-11-19T00:00:00.000Z"),
        amount: 15_000,
        memo: null,
        transferTransactionId: null,
        payee: { name: "Starting Balance" },
      },
    ] as never);

    const candidates = await findTransferLinkCandidates(
      form({
        accountId: "sav",
        sourceAccountId: "",
        date: "2026-11-19",
        amount: "-15",
      }),
    );

    expect(candidates).toEqual([{ id: "near", date: "2026-11-18", amount: 15_000, memo: "bank" }]);
  });
});

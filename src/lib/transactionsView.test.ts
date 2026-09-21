import { prisma } from "@/lib/prisma";
import { loadTransactionsView } from "@/lib/transactionsView";
import { STARTING_BALANCE_PAYEE } from "@/lib/payees";
import type { TransactionFilters } from "@/lib/transactionFilters";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: { findMany: jest.fn(), count: jest.fn() },
  },
}));

const mockFindMany = jest.mocked(prisma.transaction.findMany);
const mockCount = jest.mocked(prisma.transaction.count);

const noFilters: TransactionFilters = {
  dateFrom: "",
  dateTo: "",
  preset: null,
  category: "",
  direction: "all",
  q: "",
};

describe("loadTransactionsView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  // The starting-balance divergence #97 exists to fix: a single account's
  // own starting-balance transaction is a real row of that account's
  // history, so it stays in the accountId branch's `where` - only the
  // budget-wide accountId-less branch excludes it (see the account-less
  // test below).
  it("does not exclude the starting-balance payee when scoped to a single account", async () => {
    await loadTransactionsView({
      budgetId: "budget-1",
      accountId: "account-1",
      filters: noFilters,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: "account-1" } }),
    );
    expect(mockCount).toHaveBeenCalledWith({
      where: { accountId: "account-1" },
    });
  });

  it("scopes to the account and includes only payee/category, no account select", async () => {
    await loadTransactionsView({
      budgetId: "budget-1",
      accountId: "account-1",
      filters: noFilters,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { payee: true, category: true },
      }),
    );
  });

  it("excludes the starting-balance payee budget-wide when no accountId is given", async () => {
    await loadTransactionsView({
      budgetId: "budget-1",
      filters: noFilters,
    });

    const expectedWhere = {
      account: { budgetId: "budget-1" },
      NOT: { payee: { name: STARTING_BALANCE_PAYEE } },
    };
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(mockCount).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("includes the account name when no accountId is given", async () => {
    await loadTransactionsView({
      budgetId: "budget-1",
      filters: noFilters,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          payee: true,
          category: true,
          account: { select: { name: true } },
        },
      }),
    );
  });

  it("merges the filters' where clause into the findMany call but not into count", async () => {
    await loadTransactionsView({
      budgetId: "budget-1",
      accountId: "account-1",
      filters: { ...noFilters, direction: "inflow" },
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: "account-1", amount: { gt: 0 } },
      }),
    );
    expect(mockCount).toHaveBeenCalledWith({
      where: { accountId: "account-1" },
    });
  });

  it("returns the transactions and totalCount from the underlying queries", async () => {
    const transactions = [{ id: "t1" }] as never;
    mockFindMany.mockResolvedValue(transactions);
    mockCount.mockResolvedValue(42);

    const result = await loadTransactionsView({
      budgetId: "budget-1",
      filters: noFilters,
    });

    expect(result).toEqual({ transactions, totalCount: 42 });
  });
});

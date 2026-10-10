import { getBudgetMonthRange, requireNavigableMonth } from "./budget";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    budget: { findUniqueOrThrow: jest.fn() },
    transaction: { aggregate: jest.fn() },
    categoryMonth: { aggregate: jest.fn() },
  },
}));

const mockBudget = jest.mocked(prisma.budget.findUniqueOrThrow);
const mockTxAggregate = jest.mocked(prisma.transaction.aggregate);
const mockCmAggregate = jest.mocked(prisma.categoryMonth.aggregate);

const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d));
const now = new Date(Date.UTC(2026, 9, 10, 8)); // Oct 10, 2026

function given({
  createdAt = utc(2026, 8, 15),
  earliestTransaction = null as Date | null,
  earliestAssignment = null as Date | null,
  latestAssignment = null as Date | null,
} = {}) {
  mockBudget.mockResolvedValue({ createdAt } as never);
  mockTxAggregate.mockResolvedValue({ _min: { date: earliestTransaction } } as never);
  mockCmAggregate.mockImplementation((async (args: { _min?: unknown }) =>
    args._min
      ? { _min: { month: earliestAssignment } }
      : { _max: { month: latestAssignment } }) as never);
}

beforeEach(() => jest.clearAllMocks());

describe("getBudgetMonthRange", () => {
  it("scopes every aggregate to the budget, and the latest assignment to non-zero amounts", async () => {
    given();
    await getBudgetMonthRange("budget-1", now);

    expect(mockBudget).toHaveBeenCalledWith({ where: { id: "budget-1" }, select: { createdAt: true } });
    expect(mockTxAggregate).toHaveBeenCalledWith({
      where: { account: { budgetId: "budget-1" } },
      _min: { date: true },
    });
    expect(mockCmAggregate).toHaveBeenCalledWith({
      where: { category: { categoryGroup: { budgetId: "budget-1" } } },
      _min: { month: true },
    });
    expect(mockCmAggregate).toHaveBeenCalledWith({
      where: { category: { categoryGroup: { budgetId: "budget-1" } }, budgeted: { not: 0 } },
      _max: { month: true },
    });
  });

  it("runs from the creation month to the current month + 12 for a new budget", async () => {
    given();
    expect(await getBudgetMonthRange("budget-1", now)).toEqual({
      first: utc(2026, 8),
      last: utc(2027, 10),
    });
  });

  it("reaches back to older transactions and assignments, and forward to later assignments", async () => {
    given({
      earliestTransaction: utc(2025, 11, 20),
      earliestAssignment: utc(2026, 1),
      latestAssignment: utc(2028, 3),
    });
    expect(await getBudgetMonthRange("budget-1", now)).toEqual({
      first: utc(2025, 11),
      last: utc(2028, 3),
    });
  });
});

describe("requireNavigableMonth", () => {
  beforeEach(() => given());

  it("returns the UTC first of an in-range month", async () => {
    await expect(requireNavigableMonth("budget-1", "2026-09")).resolves.toEqual(utc(2026, 9));
  });

  it("rejects a malformed month without querying", async () => {
    await expect(requireNavigableMonth("budget-1", "2026-09-01T00:00:00.000Z")).rejects.toThrow(
      "month must be YYYY-MM",
    );
    expect(mockBudget).not.toHaveBeenCalled();
  });

  it("rejects a month before the budget's range", async () => {
    await expect(requireNavigableMonth("budget-1", "2020-01")).rejects.toThrow(
      "month is outside this budget's range",
    );
  });
});

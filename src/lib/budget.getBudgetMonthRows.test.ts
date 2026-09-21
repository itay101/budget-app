import { getBudgetMonthRows } from "./budget";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    categoryGroup: {
      findMany: jest.fn(),
    },
    categoryMonth: {
      groupBy: jest.fn(),
    },
    transaction: {
      groupBy: jest.fn(),
    },
  },
}));

const mockFindMany = jest.mocked(prisma.categoryGroup.findMany);
const mockBudgetedGroupBy = jest.mocked(prisma.categoryMonth.groupBy);
const mockActivityGroupBy = jest.mocked(prisma.transaction.groupBy);

const month = new Date(2026, 2, 1); // Mar 1, 2026
const nextMonth = new Date(2026, 3, 1); // Apr 1, 2026

beforeEach(() => {
  jest.clearAllMocks();
  mockBudgetedGroupBy.mockResolvedValue([]);
  mockActivityGroupBy.mockResolvedValue([]);
});

describe("getBudgetMonthRows", () => {
  it("scopes the category-group query to the given budget and the month boundary to lt nextMonth", async () => {
    mockFindMany.mockResolvedValue([]);

    await getBudgetMonthRows("budget-1", month);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { budgetId: "budget-1" },
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            months: { where: { month } },
            transactions: {
              where: { date: { gte: month, lt: nextMonth } },
              select: { amount: true },
            },
          },
        },
      },
    });
    expect(mockBudgetedGroupBy).toHaveBeenCalledWith({
      by: ["categoryId"],
      where: { categoryId: { in: [] }, month: { lt: nextMonth } },
      _sum: { budgeted: true },
    });
    expect(mockActivityGroupBy).toHaveBeenCalledWith({
      by: ["categoryId"],
      where: { categoryId: { in: [] }, date: { lt: nextMonth } },
      _sum: { amount: true },
    });
  });

  it("builds a row per visible category, using this month's budgeted/activity and the rolled-forward available", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Everyday Expenses",
        categories: [
          {
            id: "cat-1",
            name: "Groceries",
            hidden: false,
            months: [{ budgeted: 5000 }],
            transactions: [{ amount: -1200 }, { amount: -800 }],
          },
        ],
      },
    ] as never);
    mockBudgetedGroupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { budgeted: 15000 } },
    ] as never);
    mockActivityGroupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { amount: -4000 } },
    ] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.groups).toEqual([
      {
        id: "group-1",
        name: "Everyday Expenses",
        isEmpty: false,
        categories: [
          {
            id: "cat-1",
            name: "Groceries",
            budgeted: 5000,
            activity: -2000,
            available: 11000, // 15000 + (-4000), the rolled-forward total
          },
        ],
      },
    ]);
  });

  it("marks a group with zero categories at all as isEmpty", async () => {
    mockFindMany.mockResolvedValue([
      { id: "group-1", name: "Empty Group", categories: [] },
    ] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.groups).toEqual([
      { id: "group-1", name: "Empty Group", isEmpty: true, categories: [] },
    ]);
  });

  it("does not mark a group holding only hidden categories as isEmpty, even though it renders no visible rows", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Mixed",
        categories: [
          {
            id: "cat-hidden",
            name: "Old Category",
            hidden: true,
            months: [],
            transactions: [],
          },
        ],
      },
    ] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.groups).toEqual([
      { id: "group-1", name: "Mixed", isEmpty: false, categories: [] },
    ]);
  });

  it("filters hidden categories out of a group's rendered rows and collects them under their group name instead", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Everyday Expenses",
        categories: [
          {
            id: "cat-visible",
            name: "Groceries",
            hidden: false,
            months: [{ budgeted: 5000 }],
            transactions: [],
          },
          {
            id: "cat-hidden",
            name: "Old Category",
            hidden: true,
            months: [{ budgeted: 0 }],
            transactions: [{ amount: -300 }],
          },
        ],
      },
    ] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.groups[0].categories).toEqual([
      expect.objectContaining({ id: "cat-visible" }),
    ]);
    expect(result.hiddenCategories).toEqual([
      expect.objectContaining({ id: "cat-hidden", groupName: "Everyday Expenses" }),
    ]);
  });

  it("includes hidden categories in categoryOptions since they still need a place to move money to/from", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Everyday Expenses",
        categories: [
          {
            id: "cat-hidden",
            name: "Old Category",
            hidden: true,
            months: [],
            transactions: [],
          },
        ],
      },
    ] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.categoryOptions).toEqual([
      {
        id: "group-1",
        name: "Everyday Expenses",
        categories: [{ id: "cat-hidden", name: "Old Category", available: 0 }],
      },
    ]);
  });

  // #98: a transaction with no category (categoryId: null) groups under a
  // null key in the activity groupBy result. That null-keyed entry gets
  // inserted into activityThroughMonth, but real category ids are never
  // null, so it's never looked up — harmless today, freezing it here so a
  // future change can't silently turn it into a live bug.
  it("tolerates a null categoryId in the activity groupBy without affecting any real category's available", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Everyday Expenses",
        categories: [
          {
            id: "cat-1",
            name: "Groceries",
            hidden: false,
            months: [{ budgeted: 1000 }],
            transactions: [],
          },
        ],
      },
    ] as never);
    mockBudgetedGroupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { budgeted: 1000 } },
    ] as never);
    mockActivityGroupBy.mockResolvedValue([
      { categoryId: null, _sum: { amount: -9999 } },
      { categoryId: "cat-1", _sum: { amount: -500 } },
    ] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.groups[0].categories[0].available).toBe(500);
  });
});

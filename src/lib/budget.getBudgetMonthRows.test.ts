import { getBudgetMonthRows } from "./budget";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    categoryGroup: {
      findMany: jest.fn(),
    },
    categoryMonth: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

const mockFindMany = jest.mocked(prisma.categoryGroup.findMany);
const mockAssignments = jest.mocked(prisma.categoryMonth.findMany);
const mockActivityByMonth = jest.mocked(prisma.$queryRaw);

// Budget Months are UTC firsts-of-month (#124); Jest's TZ=Asia/Jerusalem
// would expose any local-time month math.
const month = new Date(Date.UTC(2026, 2, 1)); // Mar 1, 2026 UTC
const nextMonth = new Date(Date.UTC(2026, 3, 1)); // Apr 1, 2026 UTC

beforeEach(() => {
  jest.clearAllMocks();
  mockAssignments.mockResolvedValue([]);
  mockActivityByMonth.mockResolvedValue([] as never);
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
    // No categories: nothing to roll over, so no per-month queries run.
    expect(mockAssignments).not.toHaveBeenCalled();
    expect(mockActivityByMonth).not.toHaveBeenCalled();
  });

  it("loads every earlier month's non-zero assignments and per-month activity for the budget's categories", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Everyday Expenses",
        categories: [{ id: "cat-1", name: "Groceries", hidden: false, months: [], transactions: [] }],
      },
    ] as never);

    await getBudgetMonthRows("budget-1", month);

    expect(mockAssignments).toHaveBeenCalledWith({
      where: { categoryId: { in: ["cat-1"] }, month: { lt: nextMonth }, budgeted: { not: 0 } },
      select: { categoryId: true, month: true, budgeted: true },
    });
    const [sql, ...values] = mockActivityByMonth.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(sql.join("?")).toContain("date_trunc('month', \"date\")");
    expect(sql.join("?")).toContain("GROUP BY 1, 2");
    // A plain timestamp literal, so the session time zone can't move the bound.
    expect(values).toContainEqual("2026-04-01");
    expect(sql.join("?")).toContain("?::timestamp");
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
    // Jan +$100 assigned, $20 spent -> $80 carried into Mar (Feb empty).
    mockAssignments.mockResolvedValue([
      { categoryId: "cat-1", month: new Date(Date.UTC(2026, 0, 1)), budgeted: 10000 },
      { categoryId: "cat-1", month, budgeted: 5000 },
    ] as never);
    mockActivityByMonth.mockResolvedValue([
      { categoryId: "cat-1", month: "2026-01", amount: BigInt(-2000) },
      { categoryId: "cat-1", month: "2026-03", amount: BigInt(-2000) },
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
            carriedIn: 8000,
            available: 11000, // 8000 carried in + 5000 - 2000
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

  // ADR 0009: an overspent category starts the next month at 0.
  it("resets last month's overspending to 0 instead of carrying it into this month", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Everyday Expenses",
        categories: [
          { id: "cat-1", name: "Dining", hidden: false, months: [{ budgeted: 1000 }], transactions: [] },
        ],
      },
    ] as never);
    mockAssignments.mockResolvedValue([
      { categoryId: "cat-1", month: new Date(Date.UTC(2026, 1, 1)), budgeted: 2000 },
      { categoryId: "cat-1", month, budgeted: 1000 },
    ] as never);
    mockActivityByMonth.mockResolvedValue([
      { categoryId: "cat-1", month: "2026-02", amount: BigInt(-5000) },
    ] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.groups[0].categories[0]).toMatchObject({ carriedIn: 0, available: 1000 });
    expect(result.categoryOptions[0].categories[0].available).toBe(1000);
  });
});

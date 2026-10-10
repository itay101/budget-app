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
            targets: { orderBy: { startMonth: "desc" } },
            targetSnoozes: { where: { month }, select: { id: true } },
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
        categories: [{ id: "cat-1", name: "Groceries", hidden: false, months: [], transactions: [], targets: [], targetSnoozes: [] }],
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
            transactions: [{ amount: -1200 }, { amount: -800 }], targets: [], targetSnoozes: [],
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
            hidden: false,
            target: null,
            history: [],
            need: null,
            snoozed: false,
            status: "none",
            overspending: 0,
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
            transactions: [], targets: [], targetSnoozes: [],
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
            transactions: [], targets: [], targetSnoozes: [],
          },
          {
            id: "cat-hidden",
            name: "Old Category",
            hidden: true,
            months: [{ budgeted: 0 }],
            transactions: [{ amount: -300 }], targets: [], targetSnoozes: [],
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
            transactions: [], targets: [], targetSnoozes: [],
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
          { id: "cat-1", name: "Dining", hidden: false, months: [{ budgeted: 1000 }], transactions: [], targets: [], targetSnoozes: [] },
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

  it("resets a hidden category's overspending the same way", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Everyday Expenses",
        categories: [{ id: "cat-hidden", name: "Old Gym", hidden: true, months: [], transactions: [], targets: [], targetSnoozes: [] }],
      },
    ] as never);
    mockActivityByMonth.mockResolvedValue([
      { categoryId: "cat-hidden", month: "2026-02", amount: BigInt(-3000) },
    ] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.hiddenCategories[0]).toMatchObject({ carriedIn: 0, available: 0 });
  });

  // ADR 0011: the latest target row on or before the month applies; plan
  // totals cover hidden categories too.
  it("attaches each category's target, need and status, and sums the plan totals", async () => {
    const setAside = (amount: number) => ({
      startMonth: new Date(Date.UTC(2026, 0, 1)),
      kind: "SET_ASIDE",
      cadence: "MONTHLY",
      amount,
      weekday: null,
      dueDay: null,
      dueDate: null,
    });
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Bills",
        categories: [
          { id: "rent", name: "Rent", hidden: false, months: [{ budgeted: 1000 }], transactions: [], targets: [setAside(4000)], targetSnoozes: [] },
          { id: "gym", name: "Gym", hidden: true, months: [], transactions: [], targets: [setAside(500)], targetSnoozes: [] },
          { id: "gifts", name: "Gifts", hidden: false, months: [], transactions: [], targets: [setAside(200)], targetSnoozes: [{ id: "s1" }] },
        ],
      },
    ] as never);
    mockAssignments.mockResolvedValue([{ categoryId: "rent", month, budgeted: 1000 }] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.groups[0].categories).toEqual([
      expect.objectContaining({ id: "rent", status: "underfunded", snoozed: false, need: { ask: 4000, needed: 3000 } }),
      expect.objectContaining({ id: "gifts", status: "snoozed", snoozed: true, need: { ask: 200, needed: 0 } }),
    ]);
    expect(result.hiddenCategories[0]).toMatchObject({ id: "gym", status: "underfunded" });
    expect(result.totals).toEqual({
      needed: 3000 + 500,
      overspending: 0,
      underfunded: 3000 + 500,
      costToBeMe: 4000 + 500 + 200,
    });
  });

  it("keeps an earlier month on the row it started from after a later month edits the target", async () => {
    // Set aside $100 from Jan, edited to $250 from Mar. Every row loads;
    // the one in effect is picked per month.
    const targets = [
      { startMonth: new Date(Date.UTC(2026, 2, 1)), amount: 250000 },
      { startMonth: new Date(Date.UTC(2026, 0, 1)), amount: 100000 },
    ].map((row) => ({ ...row, kind: "SET_ASIDE", cadence: "MONTHLY", weekday: null, dueDay: null, dueDate: null }));
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Bills",
        categories: [{ id: "rent", name: "Rent", hidden: false, months: [], transactions: [], targets, targetSnoozes: [] }],
      },
    ] as never);

    const ask = async (m: Date) => (await getBudgetMonthRows("budget-1", m)).groups[0].categories[0].need?.ask;

    expect(await ask(new Date(Date.UTC(2026, 1, 1)))).toBe(100000);
    expect(await ask(new Date(Date.UTC(2026, 2, 1)))).toBe(250000);
    expect(await ask(new Date(Date.UTC(2026, 3, 1)))).toBe(250000);
  });

  it("reports each row's overspending as a positive figure", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Bills",
        categories: [
          { id: "power", name: "Power", hidden: false, months: [], transactions: [], targets: [], targetSnoozes: [] },
          { id: "food", name: "Food", hidden: true, months: [], transactions: [], targets: [], targetSnoozes: [] },
        ],
      },
    ] as never);
    mockAssignments.mockResolvedValue([{ categoryId: "food", month, budgeted: 5000 }] as never);
    mockActivityByMonth.mockResolvedValue([{ categoryId: "power", month: "2026-03", amount: BigInt(-4000) }] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.groups[0].categories[0]).toMatchObject({ available: -4000, overspending: 4000, status: "overspent" });
    expect(result.hiddenCategories[0]).toMatchObject({ available: 5000, overspending: 0 });
    expect(result.totals.overspending).toBe(4000);
  });

  it("treats a NONE row as no target", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Bills",
        categories: [
          {
            id: "rent",
            name: "Rent",
            hidden: false,
            months: [],
            transactions: [],
            targets: [{ startMonth: month, kind: "NONE", cadence: null, amount: 0, weekday: null, dueDay: null, dueDate: null }],
            targetSnoozes: [],
          },
        ],
      },
    ] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    expect(result.groups[0].categories[0]).toMatchObject({ target: null, need: null, status: "none" });
  });

  it("gives a yearly Set aside this cycle's assignments, not its balance", async () => {
    // Due Jun 1 each year, so the cycle runs Jul 2025 - Jun 2026. $600
    // assigned in Jan and spent; nothing carried into March.
    mockFindMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Bills",
        categories: [
          {
            id: "insurance",
            name: "Insurance",
            hidden: false,
            months: [],
            transactions: [],
            targets: [
              {
                startMonth: new Date(Date.UTC(2025, 0, 1)),
                kind: "SET_ASIDE",
                cadence: "YEARLY",
                amount: 1200000,
                weekday: null,
                dueDay: null,
                dueDate: new Date(Date.UTC(2026, 5, 1)),
              },
            ],
            targetSnoozes: [],
          },
        ],
      },
    ] as never);
    mockAssignments.mockResolvedValue([
      { categoryId: "insurance", month: new Date(Date.UTC(2026, 0, 1)), budgeted: 600000 },
    ] as never);
    mockActivityByMonth.mockResolvedValue([
      { categoryId: "insurance", month: "2026-01", amount: BigInt(-600000) },
    ] as never);

    const result = await getBudgetMonthRows("budget-1", month);

    // ($1,200 - $600 set aside this cycle) / Mar..Jun (4 months) = $150.
    expect(result.groups[0].categories[0]).toMatchObject({
      carriedIn: 0,
      need: { ask: 150000, needed: 150000, goal: { have: 600000, amount: 1200000 } },
    });
  });
});

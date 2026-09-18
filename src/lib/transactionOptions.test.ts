import { prisma } from "@/lib/prisma";
import { getTransactionEditOptions } from "@/lib/transactionOptions";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    categoryGroup: { findMany: jest.fn() },
    payee: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

const mockCategoryGroupFindMany = jest.mocked(prisma.categoryGroup.findMany);
const mockPayeeFindMany = jest.mocked(prisma.payee.findMany);
const mockQueryRaw = jest.mocked(prisma.$queryRaw);

describe("getTransactionEditOptions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCategoryGroupFindMany.mockResolvedValue([]);
    mockPayeeFindMany.mockResolvedValue([]);
    mockQueryRaw.mockResolvedValue([]);
  });

  it("scopes every query - including payeeLastCategory's raw SQL - to the caller's own budgetId", async () => {
    await getTransactionEditOptions("budget-1");

    expect(mockCategoryGroupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { budgetId: "budget-1" } }),
    );
    expect(mockPayeeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { budgetId: "budget-1" } }),
    );

    // payeeLastCategory's lookup (#88) is a raw query rather than a
    // Prisma `where` filter, so it can't be pinned down the same way -
    // this instead reconstructs the interpolated SQL and checks that
    // "budget-1" is the *only* value substituted into it, right after a
    // `WHERE a."budgetId" =`. A future edit that widened the WHERE clause,
    // dropped the budget filter, or otherwise let another budget's
    // payees leak into this one's lookup would fail this assertion - see
    // #88's discussion of why a per-user/per-budget remembered category
    // must never bleed across budgets that happen to share a payee name.
    const [strings, ...values] = mockQueryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(values).toEqual(["budget-1"]);
    expect(strings.join("?")).toMatch(/WHERE a\."budgetId" = \? AND/);
  });

  it("returns an empty payeeLastCategory when the raw lookup finds nothing", async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await getTransactionEditOptions("budget-1");

    expect(result.payeeLastCategory).toEqual({});
  });

  it("maps the raw lookup's rows into a payeeName -> categoryId record", async () => {
    mockQueryRaw.mockResolvedValue([
      { name: "Costco", categoryId: "cat-groceries" },
      { name: "Netflix", categoryId: "cat-subscriptions" },
    ]);

    const result = await getTransactionEditOptions("budget-1");

    expect(result.payeeLastCategory).toEqual({
      Costco: "cat-groceries",
      Netflix: "cat-subscriptions",
    });
  });
});

import { lookupAccountForPage } from "@/lib/accountLookup";
import { accessibleBudgetWhere } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: { account: { findFirst: jest.fn() } },
}));

const mockFindFirst = jest.mocked(prisma.account.findFirst);

const USER_ID = "signed-in-user";
const CURRENT = "usd-budget";
const ACCOUNT = { id: "credit-card", budgetId: CURRENT, name: "Credit Card" };

/** Accounts the mocked findFirst can see: `inCurrent` for the current-budget
 * lookup, `inAccessible` for the any-accessible-budget one. */
function setup({ inCurrent, inAccessible }: { inCurrent: boolean; inAccessible: boolean }) {
  mockFindFirst.mockImplementation((async ({ where }: { where: Record<string, unknown> }) => {
    if (where.budgetId === CURRENT) return inCurrent ? ACCOUNT : null;
    if ("budget" in where) return inAccessible ? { id: ACCOUNT.id } : null;
    throw new Error(`unexpected where: ${JSON.stringify(where)}`);
  }) as never);
}

beforeEach(() => mockFindFirst.mockReset());

describe("lookupAccountForPage", () => {
  it("returns the account when it is in the current budget", async () => {
    setup({ inCurrent: true, inAccessible: true });
    await expect(lookupAccountForPage(ACCOUNT.id, CURRENT, USER_ID)).resolves.toEqual({
      kind: "found",
      account: ACCOUNT,
    });
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it("reports otherBudget for an account in another accessible budget (#204)", async () => {
    setup({ inCurrent: false, inAccessible: true });
    await expect(lookupAccountForPage(ACCOUNT.id, CURRENT, USER_ID)).resolves.toEqual({
      kind: "otherBudget",
    });
    expect(mockFindFirst).toHaveBeenLastCalledWith({
      where: { id: ACCOUNT.id, budget: accessibleBudgetWhere(USER_ID) },
      select: { id: true },
    });
  });

  it("reports notFound for an unknown or inaccessible account", async () => {
    setup({ inCurrent: false, inAccessible: false });
    await expect(lookupAccountForPage("nope", CURRENT, USER_ID)).resolves.toEqual({
      kind: "notFound",
    });
  });
});

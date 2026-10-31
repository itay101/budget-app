import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { accessibleBudgetWhere } from "@/lib/authorization";
import { getCurrentBudget } from "@/lib/budget";
import { prisma } from "@/lib/prisma";

jest.mock("next/headers", () => ({ cookies: jest.fn() }));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    budget: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const mockCookies = jest.mocked(cookies);
const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockFindFirst = jest.mocked(prisma.budget.findFirst);
const mockCreate = jest.mocked(prisma.budget.create);

const USER_ID = "signed-in-user";
const where = accessibleBudgetWhere(USER_ID);

/** A budget row the mocked findFirst hands back for a given id lookup. */
function budget(id: string) {
  return { id, name: id, currency: "USD", ownerId: USER_ID };
}

/** Sets up the signed-in user's default, the cookie, and which budget ids
 * still resolve (accessible and not deleted). The oldest-accessible query
 * (no `id` in its `where`) returns `oldest`. */
function setup({
  cookie,
  defaultBudgetId = null,
  accessible = [],
  oldest = null,
}: {
  cookie?: string;
  defaultBudgetId?: string | null;
  accessible?: string[];
  oldest?: string | null;
}) {
  mockGetCurrentUser.mockResolvedValue({ id: USER_ID, defaultBudgetId } as never);
  mockCookies.mockResolvedValue({
    get: (name: string) => (name === "budgetId" && cookie ? { value: cookie } : undefined),
  } as never);
  mockFindFirst.mockImplementation((async (args: { where: { id?: string } }) => {
    const id = args.where.id;
    if (id === undefined) return oldest ? budget(oldest) : null;
    return accessible.includes(id) ? budget(id) : null;
  }) as never);
}

describe("getCurrentBudget", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("prefers the cookie's budget over the user's default", async () => {
    setup({ cookie: "cookie-budget", defaultBudgetId: "default-budget", accessible: ["cookie-budget", "default-budget"] });

    await expect(getCurrentBudget()).resolves.toMatchObject({ id: "cookie-budget" });
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it("lands on the user's default when there's no cookie", async () => {
    setup({ defaultBudgetId: "default-budget", accessible: ["default-budget"], oldest: "oldest-budget" });

    await expect(getCurrentBudget()).resolves.toMatchObject({ id: "default-budget" });
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "default-budget", deleted: false, ...where },
    });
  });

  it("falls back to the default when the cookie's budget is no longer accessible", async () => {
    setup({ cookie: "gone-budget", defaultBudgetId: "default-budget", accessible: ["default-budget"] });

    await expect(getCurrentBudget()).resolves.toMatchObject({ id: "default-budget" });
  });

  it("silently falls back to the oldest budget when the default is deleted or no longer shared", async () => {
    setup({ defaultBudgetId: "lost-default", accessible: [], oldest: "oldest-budget" });

    await expect(getCurrentBudget()).resolves.toMatchObject({ id: "oldest-budget" });
    expect(mockFindFirst).toHaveBeenLastCalledWith({
      where: { deleted: false, ...where },
      orderBy: { createdAt: "asc" },
    });
  });

  it("falls back to the oldest budget when the user has no default", async () => {
    setup({ oldest: "oldest-budget" });

    await expect(getCurrentBudget()).resolves.toMatchObject({ id: "oldest-budget" });
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it("looks up a cookie that matches the default only once", async () => {
    setup({ cookie: "lost-default", defaultBudgetId: "lost-default", oldest: "oldest-budget" });

    await expect(getCurrentBudget()).resolves.toMatchObject({ id: "oldest-budget" });
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it("creates a USD budget when the user can't access any", async () => {
    setup({ defaultBudgetId: "lost-default" });
    mockCreate.mockResolvedValue(budget("new-budget") as never);

    await expect(getCurrentBudget()).resolves.toMatchObject({ id: "new-budget" });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { name: "My Budget", currency: "USD", ownerId: USER_ID },
    });
  });
});

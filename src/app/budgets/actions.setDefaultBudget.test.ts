import { cookies } from "next/headers";
import { setDefaultBudget } from "@/app/budgets/actions";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentBudget } from "@/lib/budget";
import { requireBudgetAccess } from "@/lib/authorization";
import { recordAuditEntry } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/headers", () => ({ cookies: jest.fn() }));

jest.mock("@/lib/budget", () => ({
  CURRENT_BUDGET_COOKIE: "budgetId",
  getCurrentBudget: jest.fn(),
  softDeleteBudget: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/authorization", () => ({
  requireBudgetAccess: jest.fn(),
  requireBudgetOwnership: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  auditedUpdate: jest.fn(),
  diffFields: jest.fn(),
  recordAuditEntry: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: jest.fn() },
  },
}));

const mockCookies = jest.mocked(cookies);
const mockGetCurrentBudget = jest.mocked(getCurrentBudget);
const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockRequireBudgetAccess = jest.mocked(requireBudgetAccess);
const mockUserUpdate = jest.mocked(prisma.user.update);

const user = { id: "signed-in-user", defaultBudgetId: null };

/** A cookie jar holding `budgetId`, or none when it's undefined. */
function cookieJar(budgetId?: string) {
  const jar = {
    get: jest.fn((name: string) =>
      name === "budgetId" && budgetId ? { name, value: budgetId } : undefined,
    ),
    set: jest.fn(),
  };
  mockCookies.mockResolvedValue(jar as never);
  return jar;
}

function formData(budgetId: string): FormData {
  const data = new FormData();
  data.set("budgetId", budgetId);
  return data;
}

describe("setDefaultBudget", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(user as never);
  });

  it("sets an accessible budget as the user's default without switching to it or auditing", async () => {
    const jar = cookieJar("current-budget");
    mockRequireBudgetAccess.mockResolvedValue({ user, budget: { id: "shared-budget" } } as never);

    await setDefaultBudget(formData("shared-budget"));

    expect(mockRequireBudgetAccess).toHaveBeenCalledWith("shared-budget", user);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "signed-in-user" },
      data: { defaultBudgetId: "shared-budget" },
    });
    expect(jar.set).not.toHaveBeenCalled();
    expect(mockGetCurrentBudget).not.toHaveBeenCalled();
    expect(recordAuditEntry).not.toHaveBeenCalled();
  });

  it("pins the budget the user is on when there's no cookie, so the page doesn't jump to the new default", async () => {
    const jar = cookieJar();
    mockRequireBudgetAccess.mockResolvedValue({ user, budget: { id: "new-default" } } as never);
    mockGetCurrentBudget.mockResolvedValue({ id: "fallback-budget" } as never);

    await setDefaultBudget(formData("new-default"));

    expect(jar.set).toHaveBeenCalledWith("budgetId", "fallback-budget", { path: "/" });
    expect(mockGetCurrentBudget.mock.invocationCallOrder[0]).toBeLessThan(
      mockUserUpdate.mock.invocationCallOrder[0],
    );
  });

  it("rejects a budget the user can't access, leaving their default alone", async () => {
    mockRequireBudgetAccess.mockRejectedValue(new Error("Budget not found"));

    await expect(setDefaultBudget(formData("someone-elses-budget"))).rejects.toThrow(
      "Budget not found",
    );
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("clears the default when budgetId is empty", async () => {
    cookieJar("current-budget");
    await setDefaultBudget(formData(""));

    expect(mockRequireBudgetAccess).not.toHaveBeenCalled();
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "signed-in-user" },
      data: { defaultBudgetId: null },
    });
  });
});

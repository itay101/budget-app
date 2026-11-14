import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { createBudget } from "@/app/budgets/actions";
import { getCurrentUser } from "@/lib/auth";
import { createBudgetFromTemplate } from "@/lib/budget";
import { prisma } from "@/lib/prisma";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/headers", () => ({ cookies: jest.fn() }));

jest.mock("@/lib/budget", () => ({
  CURRENT_BUDGET_COOKIE: "budgetId",
  createBudgetFromTemplate: jest.fn(),
  getCurrentBudget: jest.fn(),
  softDeleteBudget: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    budget: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockCookies = jest.mocked(cookies);
const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockCreate = jest.mocked(createBudgetFromTemplate);
const mockFindFirst = jest.mocked(prisma.budget.findFirst);
const mockTransaction = jest.mocked(prisma.$transaction);

const tx = { stub: "tx" };
const jar = { set: jest.fn() };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = { name: "Trip", currency: "nzd", template: "minimalist" };

beforeEach(() => {
  jest.clearAllMocks();
  mockCookies.mockResolvedValue(jar as never);
  mockGetCurrentUser.mockResolvedValue({ id: "u-1" } as never);
  mockFindFirst.mockResolvedValue(null);
  mockTransaction.mockImplementation(((fn: (t: typeof tx) => unknown) => fn(tx)) as never);
  mockCreate.mockResolvedValue({ id: "b-new" } as never);
});

describe("createBudget", () => {
  it("creates the budget from the chosen template and switches to it", async () => {
    await createBudget(form(valid));

    expect(mockCreate).toHaveBeenCalledWith(tx, {
      name: "Trip",
      currency: "NZD",
      ownerId: "u-1",
      templateId: "minimalist",
    });
    expect(jar.set).toHaveBeenCalledWith("budgetId", "b-new", { path: "/" });
  });

  it("accepts Blank", async () => {
    await createBudget(form({ ...valid, template: "blank" }));
    expect(mockCreate).toHaveBeenCalledWith(tx, expect.objectContaining({ templateId: "blank" }));
  });

  it.each([
    ["a missing template", { name: "Trip", currency: "NZD" }],
    ["an unknown template", { ...valid, template: "nope" }],
  ])("rejects %s before touching the database", async (_label, fields) => {
    await expect(createBudget(form(fields))).rejects.toThrow("Choose how the budget starts");
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a missing name or currency", async () => {
    await expect(createBudget(form({ ...valid, name: "  " }))).rejects.toThrow(
      "Budget name is required",
    );
    await expect(createBudget(form({ ...valid, currency: "XXX" }))).rejects.toThrow(
      "Choose a currency",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a currency the owner already has a budget in", async () => {
    mockFindFirst.mockResolvedValue({ name: "Old" } as never);
    await expect(createBudget(form(valid))).rejects.toThrow(
      '"Old" already uses NZD — each currency can only be open in one of your budgets.',
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("turns a unique-constraint race into a friendly error", async () => {
    mockCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );
    await expect(createBudget(form(valid))).rejects.toThrow("A budget for NZD already exists.");
    expect(jar.set).not.toHaveBeenCalled();
  });
});

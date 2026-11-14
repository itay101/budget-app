import { autoAssign, undoAutoAssign } from "@/app/(app)/budget/actions";
import { prisma } from "@/lib/prisma";
import { requireCategoryAccess } from "@/lib/authorization";
import { getBudgetMonthRows, requireNavigableMonth } from "@/lib/budget";
import { addMonths, currentBudgetMonth } from "@/lib/budgetMonth";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/authorization", () => ({
  requireCategoryAccess: jest.fn(),
  requireCategoryGroupAccess: jest.fn(),
}));
jest.mock("@/lib/budget", () => ({
  getBudgetMonthRows: jest.fn(),
  getCurrentBudget: jest.fn(),
  requireNavigableMonth: jest.fn(),
}));
// recordAuditEntry runs for real against this client, standing in for
// both `prisma` and the transaction's `tx`.
jest.mock("@/lib/prisma", () => ({
  prisma: {
    categoryMonth: { findUnique: jest.fn(), upsert: jest.fn() },
    auditEntry: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const current = currentBudgetMonth();
const findUnique = jest.mocked(prisma.categoryMonth.findUnique);
const upsert = jest.mocked(prisma.categoryMonth.upsert);
const auditCreate = jest.mocked(prisma.auditEntry.create);
const access = (systemKind: string | null = null, budgetId = "budget-1") =>
  ({ user: { id: "user-1" }, budgetId, systemKind }) as never;

/** Assigned per category before the run. */
let stored: Record<string, number>;

function form(rows: { categoryId: string; from: number; to: number }[], option = "underfunded") {
  const formData = new FormData();
  formData.set("option", option);
  formData.set("month", "2026-11");
  formData.set("rows", JSON.stringify(rows));
  return formData;
}

beforeEach(() => {
  jest.clearAllMocks();
  stored = { rent: 0, food: 5_000 };
  jest.mocked(requireCategoryAccess).mockResolvedValue(access());
  jest.mocked(requireNavigableMonth).mockResolvedValue(current);
  jest.mocked(getBudgetMonthRows).mockResolvedValue({ readyToAssign: { total: 100_000 } } as never);
  jest.mocked(prisma.$transaction).mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  findUnique.mockImplementation((({ where }: { where: { categoryId_month: { categoryId: string } } }) =>
    Promise.resolve({ budgeted: stored[where.categoryId_month.categoryId] ?? 0 })) as never);
  upsert.mockImplementation((({ where }: { where: { categoryId_month: { categoryId: string } } }) =>
    Promise.resolve({ id: `cm-${where.categoryId_month.categoryId}` })) as never);
});

describe("autoAssign (#147, #219)", () => {
  it("sets each row's Assigned and audits it with the option", async () => {
    const result = await autoAssign(form([{ categoryId: "rent", from: 0, to: 30_000 }, { categoryId: "food", from: 5_000, to: 9_000 }]));

    expect(upsert.mock.calls.map(([args]) => [args.where.categoryId_month!.categoryId, args.update])).toEqual([
      ["rent", { budgeted: 30_000 }],
      ["food", { budgeted: 9_000 }],
    ]);
    expect(auditCreate.mock.calls.map(([args]) => args.data)).toEqual([
      expect.objectContaining({ entityId: "cm-rent", action: "auto-assigned", changes: { budgeted: [0, 30_000], option: [null, "underfunded"] } }),
      expect.objectContaining({ entityId: "cm-food", action: "auto-assigned", changes: { budgeted: [5_000, 9_000], option: [null, "underfunded"] } }),
    ]);
    expect(result).toEqual({
      applied: [{ categoryId: "rent", from: 0, to: 30_000 }, { categoryId: "food", from: 5_000, to: 9_000 }],
      skipped: [],
    });
  });

  it("skips a row whose Assigned changed since the preview, and applies the rest", async () => {
    stored.food = 7_000;
    const result = await autoAssign(form([{ categoryId: "rent", from: 0, to: 30_000 }, { categoryId: "food", from: 5_000, to: 9_000 }]));

    expect(result.skipped).toEqual(["food"]);
    expect(result.applied.map((r) => r.categoryId)).toEqual(["rent"]);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("refuses a run that would overdraw Ready to Assign, before writing", async () => {
    jest.mocked(getBudgetMonthRows).mockResolvedValue({ readyToAssign: { total: 10_000 } } as never);
    await expect(autoAssign(form([{ categoryId: "rent", from: 0, to: 30_000 }]))).rejects.toThrow("Not enough Ready to Assign");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to add money in a past month for now", async () => {
    jest.mocked(requireNavigableMonth).mockResolvedValue(addMonths(current, -1));
    await expect(autoAssign(form([{ categoryId: "rent", from: 0, to: 30_000 }]))).rejects.toThrow("past month");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown option", () => form([{ categoryId: "rent", from: 0, to: 1 }], "everything"), "Unknown Auto-Assign option"],
    ["no rows", () => form([]), "rows are required"],
    ["a non-integer amount", () => form([{ categoryId: "rent", from: 0, to: 1.5 }]), "integer"],
  ])("refuses %s", async (_name, make, message) => {
    await expect(autoAssign(make())).rejects.toThrow(message);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses the system Inflow: Ready to Assign category, or rows from two budgets", async () => {
    jest.mocked(requireCategoryAccess).mockResolvedValueOnce(access("READY_TO_ASSIGN"));
    await expect(autoAssign(form([{ categoryId: "rta", from: 0, to: 1_000 }]))).rejects.toThrow("can't be changed");

    jest
      .mocked(requireCategoryAccess)
      .mockImplementation((id: string) => Promise.resolve(access(null, id === "rent" ? "budget-1" : "budget-2")));
    await expect(
      autoAssign(form([{ categoryId: "rent", from: 0, to: 1_000 }, { categoryId: "food", from: 5_000, to: 6_000 }])),
    ).rejects.toThrow("different budgets");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("undoAutoAssign", () => {
  it("puts each row back if it still holds what the run set, without a Ready to Assign check", async () => {
    stored = { rent: 30_000, food: 6_000 };
    const result = await undoAutoAssign(form([{ categoryId: "rent", from: 0, to: 30_000 }, { categoryId: "food", from: 5_000, to: 9_000 }]));

    expect(getBudgetMonthRows).not.toHaveBeenCalled();
    expect(upsert.mock.calls.map(([args]) => args.update)).toEqual([{ budgeted: 0 }]);
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({ action: "auto-assign undone", changes: { budgeted: [30_000, 0] } });
    expect(result).toEqual({ applied: [{ categoryId: "rent", from: 0, to: 30_000 }], skipped: ["food"] });
  });
});

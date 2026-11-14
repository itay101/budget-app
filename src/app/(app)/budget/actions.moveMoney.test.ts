import { transferAvailable } from "@/app/(app)/budget/actions";
import { prisma } from "@/lib/prisma";
import { requireCategoryAccess } from "@/lib/authorization";
import { requireNavigableMonth } from "@/lib/budget";
import { READY_TO_ASSIGN } from "@/lib/readyToAssign";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/authorization", () => ({
  requireCategoryAccess: jest.fn(),
  requireCategoryGroupAccess: jest.fn(),
}));
jest.mock("@/lib/budget", () => ({
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

const november = new Date(Date.UTC(2026, 10, 1));
const upsert = jest.mocked(prisma.categoryMonth.upsert);
const findUnique = jest.mocked(prisma.categoryMonth.findUnique);
const auditCreate = jest.mocked(prisma.auditEntry.create);

const access = (systemKind: string | null = null, budgetId = "budget-1") =>
  ({ user: { id: "user-1" }, budgetId, systemKind }) as never;

function form(fromCategoryId: string, toCategoryId: string, amount = "25") {
  const formData = new FormData();
  formData.set("fromCategoryId", fromCategoryId);
  formData.set("toCategoryId", toCategoryId);
  formData.set("month", "2026-11");
  formData.set("amount", amount);
  return formData;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requireCategoryAccess).mockResolvedValue(access());
  jest.mocked(requireNavigableMonth).mockResolvedValue(november);
  jest.mocked(prisma.$transaction).mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  findUnique.mockResolvedValue({ budgeted: 10_000 } as never);
  upsert.mockImplementation((({ where, update }: { where: { categoryId_month: { categoryId: string } }; update: { budgeted: { increment: number } } }) =>
    Promise.resolve({ id: `cm-${where.categoryId_month.categoryId}`, budgeted: 10_000 + update.budgeted.increment })) as never);
});

describe("transferAvailable with Ready to Assign (#134, #217)", () => {
  it("from Ready to Assign: raises only the category's budgeted, with one audit entry", async () => {
    await transferAvailable(form(READY_TO_ASSIGN, "rent"));

    expect(requireCategoryAccess).toHaveBeenCalledTimes(1);
    expect(requireCategoryAccess).toHaveBeenCalledWith("rent");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { categoryId_month: { categoryId: "rent", month: november } },
      create: { categoryId: "rent", month: november, budgeted: 25_000 },
      update: { budgeted: { increment: 25_000 } },
    });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      entityType: "CATEGORY_MONTH",
      entityId: "cm-rent",
      action: "updated",
      changes: { budgeted: [10_000, 35_000] },
    });
  });

  it("to Ready to Assign: lowers only the category's budgeted, even below 0", async () => {
    await transferAvailable(form("food", READY_TO_ASSIGN, "40"));

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      create: { categoryId: "food", budgeted: -40_000 },
      update: { budgeted: { increment: -40_000 } },
    });
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      changes: { budgeted: [10_000, -30_000] },
    });
  });

  it("between two categories: still one change and one audit entry each", async () => {
    await transferAvailable(form("food", "rent"));

    expect(upsert.mock.calls.map(([args]) => args.update)).toEqual([
      { budgeted: { increment: -25_000 } },
      { budgeted: { increment: 25_000 } },
    ]);
    expect(auditCreate).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["Ready to Assign to Ready to Assign", () => form(READY_TO_ASSIGN, READY_TO_ASSIGN), "Ready to Assign to Ready to Assign"],
    ["a zero amount", () => form(READY_TO_ASSIGN, "rent", "0"), "Amount must be greater than zero"],
  ])("refuses %s before any lookup or write", async (_name, make, message) => {
    await expect(transferAvailable(make())).rejects.toThrow(message);
    expect(requireCategoryAccess).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses the Inflow: Ready to Assign category as either side", async () => {
    jest.mocked(requireCategoryAccess).mockResolvedValue(access("READY_TO_ASSIGN"));
    await expect(transferAvailable(form(READY_TO_ASSIGN, "inflow-rta"))).rejects.toThrow(
      "Inflow: Ready to Assign can't be changed",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses categories from two different budgets", async () => {
    jest
      .mocked(requireCategoryAccess)
      .mockImplementation((id: string) => Promise.resolve(access(null, id === "food" ? "budget-1" : "budget-2")));
    await expect(transferAvailable(form("food", "rent"))).rejects.toThrow(
      "Cannot move money between different budgets",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

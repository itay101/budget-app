import { removeTarget, setTarget, snoozeTarget, unsnoozeTarget } from "@/app/(app)/budget/actions";
import { prisma } from "@/lib/prisma";
import { requireCategoryAccess } from "@/lib/authorization";
import { requireNavigableMonth } from "@/lib/budget";

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
// The audited* helpers run for real against this client, standing in for
// both `prisma` and the transaction's `tx`.
jest.mock("@/lib/prisma", () => ({
  prisma: {
    categoryTarget: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    categoryTargetSnooze: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    auditEntry: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockRequireCategoryAccess = jest.mocked(requireCategoryAccess);
const mockRequireNavigableMonth = jest.mocked(requireNavigableMonth);
const target = jest.mocked(prisma.categoryTarget);
const snooze = jest.mocked(prisma.categoryTargetSnooze);
const auditCreate = jest.mocked(prisma.auditEntry.create);

const utc = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));
const october = utc(2026, 10);
const march = utc(2026, 3);

const monthlyRow = {
  id: "target-march",
  categoryId: "category-1",
  startMonth: march,
  kind: "SET_ASIDE" as const,
  cadence: "MONTHLY" as const,
  amount: 400_000,
  weekday: null,
  dueDay: null,
  dueDate: null,
};

/** What writeTargetRow's findUnique selects: the id and target fields. */
const { categoryId: _categoryId, startMonth: _startMonth, ...selectedOctoberRow } = {
  ...monthlyRow,
  id: "target-october",
};

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set("categoryId", "category-1");
  formData.set("month", "2026-10");
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function auditedChanges() {
  return auditCreate.mock.calls.map(([args]) => args.data);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireCategoryAccess.mockResolvedValue({ user: { id: "user-1" }, budgetId: "budget-1" } as never);
  mockRequireNavigableMonth.mockResolvedValue(october);
  jest.mocked(prisma.$transaction).mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  target.findUnique.mockResolvedValue(null);
  target.findMany.mockResolvedValue([]);
  target.create.mockImplementation((({ data }: { data: object }) => Promise.resolve({ id: "target-new", ...data })) as never);
  target.update.mockResolvedValue({} as never);
  snooze.findUnique.mockResolvedValue(null);
  snooze.create.mockResolvedValue({ id: "snooze-1" } as never);
  snooze.delete.mockResolvedValue({} as never);
});

describe("setTarget", () => {
  it("creates a row at the viewed month when an earlier month has one, leaving the earlier row alone", async () => {
    target.findMany.mockResolvedValue([monthlyRow] as never);

    await setTarget(form({ kind: "REFILL", cadence: "MONTHLY", amount: "500" }));

    expect(mockRequireNavigableMonth).toHaveBeenCalledWith("budget-1", "2026-10");
    expect(target.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { categoryId_startMonth: { categoryId: "category-1", startMonth: october } } }),
    );
    expect(target.create).toHaveBeenCalledWith({
      data: {
        categoryId: "category-1",
        startMonth: october,
        kind: "REFILL",
        cadence: "MONTHLY",
        amount: 500_000,
        weekday: null,
        dueDay: null,
        dueDate: null,
      },
    });
    expect(target.update).not.toHaveBeenCalled();
    expect(auditedChanges()).toEqual([
      expect.objectContaining({
        entityType: "CATEGORY_TARGET",
        entityId: "target-new",
        action: "created",
        actorId: "user-1",
        budgetId: "budget-1",
        changes: expect.objectContaining({ startMonth: [null, october.toISOString()], kind: [null, "REFILL"] }),
      }),
    ]);
  });

  it("updates the viewed month's own row in place and audits only what changed", async () => {
    target.findUnique.mockResolvedValue(selectedOctoberRow as never);

    await setTarget(form({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: "450", dueDay: "15" }));

    expect(target.create).not.toHaveBeenCalled();
    expect(target.update).toHaveBeenCalledWith({
      where: { id: "target-october" },
      data: expect.objectContaining({ amount: 450_000, dueDay: 15 }),
    });
    expect(auditedChanges()).toEqual([
      expect.objectContaining({
        entityId: "target-october",
        action: "updated",
        changes: { amount: [400_000, 450_000], dueDay: [null, 15] },
      }),
    ]);
  });

  it("writes nothing when the viewed month already has that target", async () => {
    target.findUnique.mockResolvedValue(selectedOctoberRow as never);

    await setTarget(form({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: "400" }));

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an incomplete target before writing", async () => {
    await expect(setTarget(form({ kind: "SET_ASIDE", cadence: "WEEKLY", amount: "50" }))).rejects.toThrow(
      "day of the week",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a category the user can't access before reading or writing targets", async () => {
    mockRequireCategoryAccess.mockRejectedValue(new Error("Category not found"));

    await expect(setTarget(form({ kind: "BALANCE", amount: "1" }))).rejects.toThrow("Category not found");
    expect(target.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("removeTarget", () => {
  it("writes a NONE row at the viewed month", async () => {
    target.findMany.mockResolvedValue([monthlyRow] as never);

    await removeTarget(form({}));

    expect(target.findMany).toHaveBeenCalledWith({
      where: { categoryId: "category-1", startMonth: { lte: october } },
      orderBy: { startMonth: "desc" },
      take: 1,
    });
    expect(target.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ categoryId: "category-1", startMonth: october, kind: "NONE", amount: 0 }),
    });
    expect(auditedChanges()).toEqual([
      expect.objectContaining({ entityType: "CATEGORY_TARGET", action: "created" }),
    ]);
  });

  it("is a no-op when no target applies in the viewed month", async () => {
    target.findMany.mockResolvedValue([{ ...monthlyRow, kind: "NONE", cadence: null }] as never);

    await removeTarget(form({}));

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("snoozeTarget / unsnoozeTarget", () => {
  it("snoozes the viewed month with an audit entry, without starting a target row", async () => {
    target.findMany.mockResolvedValue([monthlyRow] as never);

    await snoozeTarget(form({}));

    expect(snooze.create).toHaveBeenCalledWith({ data: { categoryId: "category-1", month: october } });
    expect(target.create).not.toHaveBeenCalled();
    expect(auditedChanges()).toEqual([
      expect.objectContaining({
        entityType: "CATEGORY_TARGET_SNOOZE",
        entityId: "snooze-1",
        action: "created",
        changes: { categoryId: [null, "category-1"], month: [null, october.toISOString()] },
      }),
    ]);
  });

  it("won't snooze a category with no target", async () => {
    await expect(snoozeTarget(form({}))).rejects.toThrow("no target to snooze");
    expect(snooze.create).not.toHaveBeenCalled();
  });

  it("leaves an existing snooze alone", async () => {
    target.findMany.mockResolvedValue([monthlyRow] as never);
    snooze.findUnique.mockResolvedValue({ id: "snooze-1" } as never);

    await snoozeTarget(form({}));

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("unsnoozes by deleting the snooze, with an audit entry", async () => {
    snooze.findUnique.mockResolvedValue({ id: "snooze-1" } as never);

    await unsnoozeTarget(form({}));

    expect(snooze.delete).toHaveBeenCalledWith({ where: { id: "snooze-1" } });
    expect(auditedChanges()).toEqual([
      expect.objectContaining({
        entityType: "CATEGORY_TARGET_SNOOZE",
        entityId: "snooze-1",
        action: "deleted",
        changes: { categoryId: ["category-1", null], month: [october.toISOString(), null] },
      }),
    ]);
  });

  it("is a no-op to unsnooze a month that isn't snoozed", async () => {
    await unsnoozeTarget(form({}));

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

import {
  assertCategoryUsable,
  assertNotSystem,
  categoryUsableError,
  readyToAssignCategoryId,
  seedSystemCategories,
} from "@/lib/systemCategories";

/** A stub client standing in for both `prisma` and a transaction's `tx`. */
function stubDb() {
  return {
    categoryGroup: {
      create: jest.fn(({ data }) => Promise.resolve({ id: "group-inflow", ...data })),
    },
    category: {
      create: jest.fn(({ data }) => Promise.resolve({ id: "category-rta", ...data })),
      findFirstOrThrow: jest.fn(),
      findUnique: jest.fn(),
    },
    account: { findUniqueOrThrow: jest.fn() },
    auditEntry: { createMany: jest.fn(), create: jest.fn() },
  };
}

const onBudget = { budgetId: "budget-1", accountOnBudget: true };
const offBudget = { budgetId: "budget-1", accountOnBudget: false };

describe("seedSystemCategories", () => {
  it("creates the Inflow group first in sort order, its one Ready to Assign category, and audits both", async () => {
    const db = stubDb();

    await seedSystemCategories(db as never, { budgetId: "budget-1", actorId: "user-1" });

    expect(db.categoryGroup.create).toHaveBeenCalledWith({
      data: { budgetId: "budget-1", name: "Inflow", sortOrder: -1, systemKind: "INFLOW" },
    });
    expect(db.category.create).toHaveBeenCalledWith({
      data: {
        categoryGroupId: "group-inflow",
        name: "Inflow: Ready to Assign",
        sortOrder: 0,
        systemKind: "READY_TO_ASSIGN",
      },
    });
    const audited = [...db.auditEntry.createMany.mock.calls.flatMap(([args]) => args.data)];
    expect(audited).toEqual([
      expect.objectContaining({ entityType: "CATEGORY_GROUP", entityId: "group-inflow", action: "created" }),
      expect.objectContaining({ entityType: "CATEGORY", entityId: "category-rta", action: "created" }),
    ]);
  });
});

describe("readyToAssignCategoryId", () => {
  it("looks the category up by its system marker within the budget, not by name", async () => {
    const db = stubDb();
    db.category.findFirstOrThrow.mockResolvedValue({ id: "category-rta" });

    await expect(readyToAssignCategoryId(db as never, "budget-1")).resolves.toBe("category-rta");
    expect(db.category.findFirstOrThrow).toHaveBeenCalledWith({
      where: { systemKind: "READY_TO_ASSIGN", categoryGroup: { budgetId: "budget-1" } },
      select: { id: true },
    });
  });
});

describe("assertNotSystem", () => {
  it.each([null, undefined])("allows an ordinary row (%p)", (kind) => {
    expect(() => assertNotSystem(kind)).not.toThrow();
  });

  it.each(["INFLOW", "READY_TO_ASSIGN"] as const)("refuses a %s row", (kind) => {
    expect(() => assertNotSystem(kind)).toThrow("Inflow: Ready to Assign can't be changed");
  });
});

describe("categoryUsableError", () => {
  const ordinary = { budgetId: "budget-1", systemKind: null };
  const readyToAssign = { budgetId: "budget-1", systemKind: "READY_TO_ASSIGN" as const };

  it("allows an ordinary category on any account of its own budget", () => {
    expect(categoryUsableError(ordinary, onBudget)).toBeNull();
    expect(categoryUsableError(ordinary, offBudget)).toBeNull();
  });

  it("allows Inflow: Ready to Assign on an on-budget account", () => {
    expect(categoryUsableError(readyToAssign, onBudget)).toBeNull();
  });

  it("refuses Inflow: Ready to Assign on an off-budget account, which never counts as income", () => {
    expect(categoryUsableError(readyToAssign, offBudget)).toBe(
      "Inflow: Ready to Assign can only be used on an on-budget account",
    );
  });

  it("refuses a category from another budget, or one that doesn't exist", () => {
    expect(categoryUsableError({ ...ordinary, budgetId: "budget-2" }, onBudget)).toBe("Category not found");
    expect(categoryUsableError(null, onBudget)).toBe("Category not found");
  });
});

describe("assertCategoryUsable", () => {
  const where = { budgetId: "budget-1", accountId: "account-1" };

  it("always allows uncategorized, without a lookup", async () => {
    const db = stubDb();
    await expect(assertCategoryUsable(db as never, null, where)).resolves.toBeUndefined();
    expect(db.category.findUnique).not.toHaveBeenCalled();
    expect(db.account.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("throws categoryUsableError's reason for the loaded category and account", async () => {
    const db = stubDb();
    db.category.findUnique.mockResolvedValue({
      systemKind: "READY_TO_ASSIGN",
      categoryGroup: { budgetId: "budget-1" },
    });

    db.account.findUniqueOrThrow.mockResolvedValue({ onBudget: false });
    await expect(assertCategoryUsable(db as never, "category-rta", where)).rejects.toThrow(
      "can only be used on an on-budget account",
    );
    expect(db.account.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "account-1" },
      select: { onBudget: true },
    });

    db.account.findUniqueOrThrow.mockResolvedValue({ onBudget: true });
    await expect(assertCategoryUsable(db as never, "category-rta", where)).resolves.toBeUndefined();
  });

  it("refuses an id that doesn't exist", async () => {
    const db = stubDb();
    db.category.findUnique.mockResolvedValue(null);
    db.account.findUniqueOrThrow.mockResolvedValue({ onBudget: true });
    await expect(assertCategoryUsable(db as never, "missing", where)).rejects.toThrow("Category not found");
  });
});

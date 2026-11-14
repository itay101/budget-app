import { createBudgetFromTemplate } from "@/lib/budget";
import { getBudgetTemplate } from "@/lib/budgetTemplates";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

// Hand-built stub client, same pattern as defaultCategories.test.ts: the
// real seedCategoryGroups runs against it, so what's checked is exactly
// what a template's budget gets written with.
function mockTx() {
  let nextId = 0;
  const withIds = <T extends object>({ data }: { data: T[] }) =>
    Promise.resolve(data.map((row) => ({ id: `id-${nextId++}`, ...row })));
  return {
    budget: {
      create: jest.fn(({ data }: { data: object }) => Promise.resolve({ id: "b-1", ...data })),
    },
    // The system Inflow group and its category are single creates
    // (seedSystemCategories); a template's groups are batched.
    categoryGroup: {
      create: jest.fn(({ data }: { data: object }) => Promise.resolve({ id: "inflow", ...data })),
      createManyAndReturn: jest.fn(withIds),
    },
    category: {
      create: jest.fn(({ data }: { data: object }) => Promise.resolve({ id: "rta", ...data })),
      createManyAndReturn: jest.fn(withIds),
    },
    auditEntry: { create: jest.fn(), createMany: jest.fn() },
  };
}

const owner = { name: "Trip", currency: "NZD", ownerId: "u-1" };

describe("createBudgetFromTemplate", () => {
  it("creates the budget with its audit entry and seeds the template's groups in order", async () => {
    const tx = mockTx();
    const template = getBudgetTemplate("wedding")!;

    const created = await createBudgetFromTemplate(tx as never, {
      ...owner,
      templateId: "wedding",
    });

    expect(created.id).toBe("b-1");
    expect(tx.budget.create).toHaveBeenCalledWith({ data: owner });
    expect(tx.auditEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityType: "BUDGET", entityId: "b-1", action: "created" }),
    });
    expect(tx.categoryGroup.createManyAndReturn.mock.calls[0][0].data).toEqual(
      template.groups.map((g, sortOrder) => ({ budgetId: "b-1", name: g.name, sortOrder })),
    );
    const categories = tx.category.createManyAndReturn.mock.calls[0][0].data as { name: string }[];
    expect(categories.map((c) => c.name)).toEqual(template.groups.flatMap((g) => g.categories));
  });

  it("seeds only the system Inflow: Ready to Assign category for Blank (ADR 0008)", async () => {
    const tx = mockTx();
    await createBudgetFromTemplate(tx as never, { ...owner, templateId: "blank" });

    expect(tx.budget.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.categoryGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ budgetId: "b-1", systemKind: "INFLOW" }),
    });
    expect(tx.category.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ categoryGroupId: "inflow", systemKind: "READY_TO_ASSIGN" }),
    });
    expect(tx.categoryGroup.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.category.createManyAndReturn).not.toHaveBeenCalled();
    // One batch of audit entries: the system group and its category.
    expect(tx.auditEntry.createMany).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown template before writing anything", async () => {
    const tx = mockTx();
    await expect(
      createBudgetFromTemplate(tx as never, { ...owner, templateId: "nope" }),
    ).rejects.toThrow("Unknown budget template: nope");
    expect(tx.budget.create).not.toHaveBeenCalled();
  });
});

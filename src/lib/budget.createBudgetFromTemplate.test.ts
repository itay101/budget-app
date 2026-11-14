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
    categoryGroup: { createManyAndReturn: jest.fn(withIds) },
    category: { createManyAndReturn: jest.fn(withIds) },
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

  it("seeds nothing beyond the budget for Blank", async () => {
    const tx = mockTx();
    await createBudgetFromTemplate(tx as never, { ...owner, templateId: "blank" });

    expect(tx.budget.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.categoryGroup.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.category.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.auditEntry.createMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown template before writing anything", async () => {
    const tx = mockTx();
    await expect(
      createBudgetFromTemplate(tx as never, { ...owner, templateId: "nope" }),
    ).rejects.toThrow("Unknown budget template: nope");
    expect(tx.budget.create).not.toHaveBeenCalled();
  });
});

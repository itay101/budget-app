import { DEFAULT_CATEGORY_GROUPS, seedDefaultCategories } from "./defaultCategories";

// Hand-built stub client, same pattern as audit.test.ts: what's under test
// is what gets written and in which order, not Postgres behaviour.
function mockTx() {
  let nextId = 0;
  const withIds = <T extends object>({ data }: { data: T[] }) =>
    Promise.resolve(data.map((row) => ({ id: `id-${nextId++}`, ...row })));
  return {
    categoryGroup: { createManyAndReturn: jest.fn(withIds) },
    category: { createManyAndReturn: jest.fn(withIds) },
    auditEntry: { create: jest.fn(), createMany: jest.fn() },
  };
}

describe("DEFAULT_CATEGORY_GROUPS", () => {
  it("has the 16 groups from the sheet, in order", () => {
    expect(DEFAULT_CATEGORY_GROUPS.map((g) => g.name)).toEqual([
      "מזון ופארמה",
      "פנאי, בילוי ותחביבים",
      "ביגוד והנעלה",
      "תכולת בית",
      "אחזקת בית",
      "טיפוח",
      "חינוך",
      "אירועים, תרומות, צרכי דת",
      "בריאות",
      "תחבורה",
      "משפחה",
      "תקשורת",
      "דיור",
      "התחייבויות",
      "נכסים",
      "פיננסים",
    ]);
  });

  it("gives every group at least one category, with no blank or duplicate names", () => {
    for (const group of DEFAULT_CATEGORY_GROUPS) {
      expect(group.categories.length).toBeGreaterThan(0);
      for (const name of group.categories) {
        expect(name.trim()).toBe(name);
        expect(name).not.toBe("");
      }
      expect(new Set(group.categories).size).toBe(group.categories.length);
    }
  });
});

describe("seedDefaultCategories", () => {
  it("creates every group with its position as sortOrder", async () => {
    const tx = mockTx();
    await seedDefaultCategories(tx as never, { budgetId: "b-1", actorId: "u-1" });

    expect(tx.categoryGroup.createManyAndReturn).toHaveBeenCalledWith({
      data: DEFAULT_CATEGORY_GROUPS.map((g, sortOrder) => ({
        budgetId: "b-1",
        name: g.name,
        sortOrder,
      })),
    });
  });

  it("creates each group's categories under that group, in order", async () => {
    const tx = mockTx();
    await seedDefaultCategories(tx as never, { budgetId: "b-1", actorId: "u-1" });

    const groups = await tx.categoryGroup.createManyAndReturn.mock.results[0].value;
    const groupIdByName = new Map(
      groups.map((g: { id: string; name: string }) => [g.name, g.id]),
    );
    const { data } = tx.category.createManyAndReturn.mock.calls[0][0];

    expect(data).toEqual(
      DEFAULT_CATEGORY_GROUPS.flatMap((g) =>
        g.categories.map((name, sortOrder) => ({
          categoryGroupId: groupIdByName.get(g.name),
          name,
          sortOrder,
        })),
      ),
    );
  });

  it("writes one audit entry per created group and category, in a single batch", async () => {
    const tx = mockTx();
    await seedDefaultCategories(tx as never, { budgetId: "b-1", actorId: "u-1" });

    const categoryCount = DEFAULT_CATEGORY_GROUPS.reduce(
      (sum, g) => sum + g.categories.length,
      0,
    );
    expect(tx.auditEntry.createMany).toHaveBeenCalledTimes(1);
    const { data } = tx.auditEntry.createMany.mock.calls[0][0];
    expect(data).toHaveLength(DEFAULT_CATEGORY_GROUPS.length + categoryCount);

    expect(data[0]).toEqual({
      budgetId: "b-1",
      entityType: "CATEGORY_GROUP",
      entityId: "id-0",
      action: "created",
      actorId: "u-1",
      changes: { name: [null, "מזון ופארמה"], sortOrder: [null, 0] },
    });
    expect(data[DEFAULT_CATEGORY_GROUPS.length]).toEqual({
      budgetId: "b-1",
      entityType: "CATEGORY",
      entityId: `id-${DEFAULT_CATEGORY_GROUPS.length}`,
      action: "created",
      actorId: "u-1",
      changes: {
        categoryGroupId: [null, "id-0"],
        name: [null, "מזון"],
        sortOrder: [null, 0],
      },
    });
  });
});

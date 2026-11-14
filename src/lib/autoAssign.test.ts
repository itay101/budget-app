import { addsMoney, planRun, proposedAssigned, type AutoAssignCategory } from "./autoAssign";

let order = 0;
function category(overrides: Partial<AutoAssignCategory> & { id: string }): AutoAssignCategory {
  return {
    name: overrides.id,
    groupId: "g-1",
    hidden: false,
    order: order++,
    assigned: 0,
    available: 0,
    needed: 0,
    due: null,
    ...overrides,
  };
}

beforeEach(() => {
  order = 0;
});

describe("proposedAssigned: Underfunded", () => {
  it("adds what the Target still needs", () => {
    expect(proposedAssigned("underfunded", category({ id: "rent", assigned: 20_000, needed: 30_000 }))).toBe(50_000);
  });

  it("lifts an overspent category back to $0 first, Target or not", () => {
    expect(proposedAssigned("underfunded", category({ id: "food", assigned: 5_000, available: -12_000 }))).toBe(17_000);
    expect(
      proposedAssigned("underfunded", category({ id: "gas", assigned: 0, available: -4_000, needed: 10_000 })),
    ).toBe(14_000);
  });

  it("leaves a funded, snoozed or target-less category unchanged", () => {
    expect(proposedAssigned("underfunded", category({ id: "fun", assigned: 10_000, available: 10_000 }))).toBeNull();
  });
});

describe("planRun", () => {
  it("funds everything when Ready to Assign covers it, in display order", () => {
    const plan = planRun(
      "underfunded",
      [category({ id: "rent", needed: 30_000 }), category({ id: "ok" }), category({ id: "food", available: -5_000 })],
      100_000,
    );
    expect(plan.rows.map((r) => [r.categoryId, r.from, r.to, r.partial])).toEqual([
      ["rent", 0, 30_000, false],
      ["food", 0, 5_000, false],
    ]);
    expect(plan.total).toBe(35_000);
  });

  it("when short, covers overspending first, then Targets by soonest due, partly funding the last", () => {
    const plan = planRun(
      "underfunded",
      [
        category({ id: "undated", needed: 10_000 }),
        category({ id: "later", needed: 10_000, due: "2026-11-28" }),
        category({ id: "sooner", needed: 10_000, due: "2026-11-05" }),
        category({ id: "overspent", available: -8_000 }),
      ],
      25_000,
    );
    const byId = Object.fromEntries(plan.rows.map((r) => [r.categoryId, r]));
    expect(byId.overspent).toMatchObject({ to: 8_000, partial: false });
    expect(byId.sooner).toMatchObject({ to: 10_000, partial: false });
    expect(byId.later).toMatchObject({ to: 7_000, partial: true });
    expect(byId.undated).toBeUndefined();
    expect(plan.total).toBe(25_000);
  });

  it("covers every category's overspending before any Target, even within one category", () => {
    // x is overspent by $10 and its Target needs $500; y is overspent by $10
    // with no Target. With $100, both overspends are covered first, and only
    // the remaining $80 goes to x's Target.
    const plan = planRun(
      "underfunded",
      [category({ id: "x", available: -10_000, needed: 500_000 }), category({ id: "y", available: -10_000 })],
      100_000,
    );
    expect(plan.rows.map((r) => [r.categoryId, r.to, r.partial])).toEqual([
      ["x", 90_000, true],
      ["y", 10_000, false],
    ]);
  });

  it("breaks ties by display order", () => {
    const plan = planRun(
      "underfunded",
      [category({ id: "first", needed: 10_000 }), category({ id: "second", needed: 10_000 })],
      10_000,
    );
    expect(plan.rows.map((r) => r.categoryId)).toEqual(["first"]);
  });

  it("adds nothing when Ready to Assign is $0 or below", () => {
    expect(planRun("underfunded", [category({ id: "rent", needed: 30_000 })], 0).rows).toEqual([]);
    expect(planRun("underfunded", [category({ id: "rent", needed: 30_000 })], -5_000).rows).toEqual([]);
  });

  it("gives the same result when run again on what it produced", () => {
    const categories = [category({ id: "rent", needed: 30_000 }), category({ id: "food", available: -5_000 })];
    const plan = planRun("underfunded", categories, 100_000);
    const after = categories.map((c) => {
      const row = plan.rows.find((r) => r.categoryId === c.id)!;
      const added = row.to - row.from;
      return { ...c, assigned: row.to, available: c.available + added, needed: Math.max(0, c.needed - added) };
    });
    expect(planRun("underfunded", after, 100_000 - plan.total).rows).toEqual([]);
  });

  it("marks Underfunded as an option that adds money", () => {
    expect(addsMoney("underfunded")).toBe(true);
  });
});

import { addsMoney, planRun, proposedAssigned, type AutoAssignCategory, type AutoAssignHistory } from "./autoAssign";

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
    overfunded: 0,
    history: emptyHistory(),
    ...overrides,
  };
}

function emptyHistory(): AutoAssignHistory {
  return { assigned: Array(12).fill(0), spent: Array(12).fill(0), firstAssigned: null, firstActive: null };
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

/** History with the last `values.length` months filled in, oldest first. */
function history(assigned: number[], spent: number[] = [], start?: { assigned?: number | null; active?: number | null }) {
  const pad = (values: number[]) => [...Array(12 - values.length).fill(0), ...values];
  const firstAssigned = start?.assigned !== undefined ? start.assigned : assigned.length ? 12 - assigned.length : null;
  const firstActive =
    start?.active !== undefined ? start.active : Math.min(...[firstAssigned, spent.length ? 12 - spent.length : null].filter((v): v is number => v !== null));
  return {
    assigned: pad(assigned),
    spent: pad(spent),
    firstAssigned,
    firstActive: Number.isFinite(firstActive) ? firstActive : null,
  };
}

describe("proposedAssigned: the other seven options (#147)", () => {
  it("Assigned and Spent Last Month replace Assigned with last month's figure", () => {
    const c = category({ id: "food", assigned: 20_000, history: history([30_000, 45_000], [10_000, 52_000]) });
    expect(proposedAssigned("assigned-last-month", c)).toBe(45_000);
    expect(proposedAssigned("spent-last-month", c)).toBe(52_000);
    // Running it again on its own result changes nothing.
    expect(proposedAssigned("assigned-last-month", { ...c, assigned: 45_000 })).toBeNull();
  });

  it("Last Month leaves a category with no history alone", () => {
    expect(proposedAssigned("assigned-last-month", category({ id: "new", assigned: 5_000 }))).toBeNull();
    expect(proposedAssigned("spent-last-month", category({ id: "new", assigned: 5_000 }))).toBeNull();
  });

  it("Average Assigned averages from the first month with Assigned, empty months as $0", () => {
    // Started 3 months ago: $30, $0, $45 → $25.
    const c = category({ id: "gas", history: history([30_000, 0, 45_000]) });
    expect(proposedAssigned("average-assigned", c)).toBe(25_000);
  });

  it("Average Spent starts from the first month with Assigned or Activity", () => {
    // Spending started 4 months ago, Assigned only 2 months ago.
    const c = category({
      id: "fun",
      history: history([10_000, 10_000], [12_000, 0, 9_000, 6_000]),
    });
    expect(c.history.firstActive).toBe(8);
    expect(proposedAssigned("average-spent", c)).toBe(6_750);
  });

  it("averages round half up to whole cents", () => {
    // $10.005 average → $10.01; $10.004 → $10.00 (three months: 30.015 / 30.012).
    expect(proposedAssigned("average-assigned", category({ id: "a", history: history([10_005, 10_005, 10_005]) }))).toBe(10_010);
    expect(proposedAssigned("average-assigned", category({ id: "b", history: history([10_004, 10_004, 10_004]) }))).toBe(10_000);
    // A whole window from before it: 12 months.
    expect(
      proposedAssigned("average-assigned", category({ id: "c", history: { ...history(Array(12).fill(1_000)), firstAssigned: 0 } })),
    ).toBe(1_000);
  });

  it("the averages leave a category with no history alone", () => {
    expect(proposedAssigned("average-assigned", category({ id: "new", assigned: 7_000 }))).toBeNull();
    expect(proposedAssigned("average-spent", category({ id: "new", assigned: 7_000 }))).toBeNull();
  });

  it("Reduce Overfunding takes back the excess, never more than this month's Assigned", () => {
    expect(proposedAssigned("reduce-overfunding", category({ id: "a", assigned: 50_000, overfunded: 20_000 }))).toBe(30_000);
    expect(proposedAssigned("reduce-overfunding", category({ id: "b", assigned: 10_000, overfunded: 25_000 }))).toBe(0);
    expect(proposedAssigned("reduce-overfunding", category({ id: "c", assigned: 10_000 }))).toBeNull();
  });

  it("Reset Available brings Available to $0 in both directions", () => {
    expect(proposedAssigned("reset-available", category({ id: "a", assigned: 30_000, available: 12_000 }))).toBe(18_000);
    expect(proposedAssigned("reset-available", category({ id: "b", assigned: 0, available: -4_000 }))).toBe(4_000);
  });

  it("Reset Assigned brings Assigned to $0", () => {
    expect(proposedAssigned("reset-assigned", category({ id: "a", assigned: 30_000 }))).toBe(0);
    expect(proposedAssigned("reset-assigned", category({ id: "b", assigned: 0 }))).toBeNull();
  });

  it("lists which options add money", () => {
    expect(["underfunded", "assigned-last-month", "spent-last-month", "average-assigned", "average-spent"].every((o) => addsMoney(o as never))).toBe(true);
    expect(["reduce-overfunding", "reset-available", "reset-assigned"].some((o) => addsMoney(o as never))).toBe(false);
  });
});

describe("planRun with decreases", () => {
  it("applies decreases first, so they fund increases in the same run", () => {
    const plan = planRun(
      "reset-available",
      [category({ id: "spare", assigned: 50_000, available: 30_000 }), category({ id: "short", available: -20_000 })],
      0,
    );
    expect(plan.rows.map((r) => [r.categoryId, r.to, r.partial])).toEqual([
      ["spare", 20_000, false],
      ["short", 20_000, false],
    ]);
    expect(plan.total).toBe(-10_000);
  });
});

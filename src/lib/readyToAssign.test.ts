import {
  moveLegs,
  READY_TO_ASSIGN,
  readyToAssignFor,
  rollForward,
  type MonthlyTotals,
} from "./readyToAssign";

const utc = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));
const jan = utc(2026, 1);
const feb = utc(2026, 2);
const mar = utc(2026, 3);

function byMonth(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

function totals(entries: Record<string, Record<string, number>>): MonthlyTotals {
  return new Map(Object.entries(entries).map(([id, months]) => [id, byMonth(months)]));
}

/** The figure plus a check that the Breakdown lines add up to it. */
function rta(input: Partial<Parameters<typeof readyToAssignFor>[0]> & { month: Date }) {
  const result = readyToAssignFor({
    current: input.month,
    incomeByMonth: new Map(),
    assignedByMonth: new Map(),
    assignedAfter: 0,
    activityByMonth: new Map(),
    ...input,
  });
  expect(result.leftOver + result.inflow - result.overspent - result.assigned - result.assignedFuture).toBe(
    result.total,
  );
  return result;
}

describe("rollForward", () => {
  it("carries a positive balance and records each month that ended overspent", () => {
    const { carriedIn, overspentByMonth } = rollForward(
      byMonth({ "2026-01": 10_000, "2026-02": 0 }),
      byMonth({ "2026-01": -4_000, "2026-02": -9_000 }),
      "2026-03",
    );
    // Jan ends at 6,000; Feb starts there and ends at −3,000.
    expect([...overspentByMonth]).toEqual([["2026-02", 3_000]]);
    expect(carriedIn).toBe(0);
  });

  it("stops before the given month", () => {
    const { overspentByMonth } = rollForward(undefined, byMonth({ "2026-02": -5_000 }), "2026-02");
    expect(overspentByMonth.size).toBe(0);
  });
});

describe("readyToAssignFor", () => {
  it("is income minus what's assigned, in one month", () => {
    const result = rta({
      month: jan,
      incomeByMonth: byMonth({ "2026-01": 100_000 }),
      assignedByMonth: totals({ rent: { "2026-01": 60_000 } }),
    });
    expect(result).toMatchObject({
      leftOver: 0,
      inflow: 100_000,
      assigned: 60_000,
      total: 40_000,
      state: "positive",
    });
  });

  it("carries what was left over into the next month", () => {
    const result = rta({
      month: feb,
      incomeByMonth: byMonth({ "2026-01": 100_000, "2026-02": 20_000 }),
      assignedByMonth: totals({ rent: { "2026-01": 60_000, "2026-02": 10_000 } }),
    });
    expect(result).toMatchObject({ leftOver: 40_000, inflow: 20_000, assigned: 10_000, total: 50_000 });
  });

  it("takes last month's cash overspending out of this month, once, while the category resets to 0", () => {
    const input = {
      incomeByMonth: byMonth({ "2026-01": 100_000 }),
      assignedByMonth: totals({ food: { "2026-01": 30_000 } }),
      activityByMonth: totals({ food: { "2026-01": -45_000 } }),
    };

    // January itself: the overspend shows on the row, not yet here.
    expect(rta({ month: jan, ...input })).toMatchObject({ overspent: 0, total: 70_000 });
    // February absorbs it.
    expect(rta({ month: feb, ...input })).toMatchObject({ leftOver: 70_000, overspent: 15_000, total: 55_000 });
    // March doesn't take it again: it's inside what was left over.
    expect(rta({ month: mar, ...input })).toMatchObject({ leftOver: 55_000, overspent: 0, total: 55_000 });
  });

  it("doesn't count spending a positive balance covers", () => {
    const result = rta({
      month: mar,
      incomeByMonth: byMonth({ "2026-01": 50_000 }),
      assignedByMonth: totals({ gifts: { "2026-01": 50_000 } }),
      activityByMonth: totals({ gifts: { "2026-02": -20_000 } }),
    });
    expect(result).toMatchObject({ overspent: 0, total: 0, state: "zero" });
  });

  it("counts Uncategorized overspending like a category's, and never its positive balance as income", () => {
    const uncategorized = totals({ __uncategorized__: { "2026-01": -8_000, "2026-02": 30_000 } });
    expect(rta({ month: feb, activityByMonth: uncategorized })).toMatchObject({ overspent: 8_000, total: -8_000 });
    // February's uncategorized inflow is a positive Uncategorized balance, not income.
    expect(rta({ month: mar, activityByMonth: uncategorized })).toMatchObject({ inflow: 0, total: -8_000 });
  });

  it("carries a negative figure forward until later income covers it", () => {
    const input = {
      incomeByMonth: byMonth({ "2026-01": 10_000, "2026-02": 25_000 }),
      assignedByMonth: totals({ rent: { "2026-01": 30_000 } }),
    };
    expect(rta({ month: jan, ...input })).toMatchObject({ total: -20_000, state: "negative" });
    expect(rta({ month: feb, ...input })).toMatchObject({ leftOver: -20_000, inflow: 25_000, total: 5_000 });
  });

  it("takes money assigned to later months out of the current month straight away", () => {
    const result = rta({
      month: feb,
      current: feb,
      incomeByMonth: byMonth({ "2026-02": 100_000 }),
      assignedByMonth: totals({ rent: { "2026-02": 40_000 } }),
      assignedAfter: 25_000,
    });
    expect(result).toMatchObject({ assignedFuture: 25_000, total: 35_000 });
  });

  it("leaves later assignments out of an earlier month's own figure", () => {
    const result = rta({
      month: jan,
      current: feb,
      incomeByMonth: byMonth({ "2026-01": 100_000 }),
      assignedByMonth: totals({ rent: { "2026-01": 40_000 } }),
      assignedAfter: 70_000,
    });
    expect(result).toMatchObject({ assignedFuture: 0, total: 60_000 });
  });

  it("treats a negative assignment (money moved back) as raising the figure", () => {
    const result = rta({
      month: feb,
      incomeByMonth: byMonth({ "2026-01": 50_000 }),
      assignedByMonth: totals({ rent: { "2026-01": 50_000, "2026-02": -10_000 } }),
    });
    expect(result).toMatchObject({ assigned: -10_000, total: 10_000 });
  });

  it("adds up exactly across many categories and months", () => {
    const assignedByMonth: MonthlyTotals = new Map();
    const activityByMonth: MonthlyTotals = new Map();
    const incomeByMonth = new Map<string, number>();
    // A deterministic spread of assignments, spending and income.
    for (let c = 0; c < 6; c++) {
      const assigned = new Map<string, number>();
      const activity = new Map<string, number>();
      for (let m = 1; m <= 12; m++) {
        const key = `2026-${String(m).padStart(2, "0")}`;
        assigned.set(key, ((c * 7 + m * 13) % 17) * 1_000);
        activity.set(key, -((c * 11 + m * 5) % 23) * 1_000);
        incomeByMonth.set(key, 40_000 + m * 10);
      }
      assignedByMonth.set(`cat-${c}`, assigned);
      activityByMonth.set(`cat-${c}`, activity);
    }
    for (let m = 1; m <= 12; m++) {
      // rta() itself checks the lines sum to the total.
      const result = rta({ month: utc(2026, m), incomeByMonth, assignedByMonth, activityByMonth });
      expect(Number.isInteger(result.total)).toBe(true);
    }
  });
});

describe("moveLegs", () => {
  it("moves between two categories: out of one, into the other", () => {
    expect(moveLegs("food", "rent", 5_000)).toEqual([
      { categoryId: "food", delta: -5_000 },
      { categoryId: "rent", delta: 5_000 },
    ]);
  });

  it("assigns money when it comes from Ready to Assign", () => {
    expect(moveLegs(READY_TO_ASSIGN, "rent", 5_000)).toEqual([{ categoryId: "rent", delta: 5_000 }]);
  });

  it("un-assigns money when it goes back to Ready to Assign", () => {
    expect(moveLegs("food", READY_TO_ASSIGN, 5_000)).toEqual([{ categoryId: "food", delta: -5_000 }]);
  });

  it("refuses the same category, or Ready to Assign, on both sides", () => {
    expect(() => moveLegs("food", "food", 1)).toThrow("Cannot move money to the same category");
    expect(() => moveLegs(READY_TO_ASSIGN, READY_TO_ASSIGN, 1)).toThrow(
      "Cannot move money from Ready to Assign to Ready to Assign",
    );
  });
});

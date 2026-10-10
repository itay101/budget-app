import { balanceFor, rowFor, type MonthlyTotals } from "./budget";

// ADR 0009: Available(M) = max(0, Available(M-1)) + assigned(M) + activity(M).
// Months are UTC; the maps are keyed by category id, then by YYYY-MM.
const utc = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));

function totals(entries: Record<string, Record<string, number>>): MonthlyTotals {
  return new Map(
    Object.entries(entries).map(([categoryId, months]) => [categoryId, new Map(Object.entries(months))]),
  );
}

describe("balanceFor", () => {
  it("is this month's assigned plus activity when nothing came before", () => {
    const assigned = totals({ "cat-1": { "2026-03": 5000 } });
    const activity = totals({ "cat-1": { "2026-03": -1200 } });

    expect(balanceFor("cat-1", assigned, activity, utc(2026, 3))).toEqual({
      carriedIn: 0,
      available: 3800,
    });
  });

  it("is 0 for a category with no assignments or activity", () => {
    expect(balanceFor("cat-unknown", new Map(), new Map(), utc(2026, 3))).toEqual({
      carriedIn: 0,
      available: 0,
    });
  });

  it("carries a positive leftover forward when nothing happens this month", () => {
    // Jan: assigned $50, spent $20 -> $30 left. Feb: nothing -> still $30.
    const assigned = totals({ groceries: { "2026-01": 5000 } });
    const activity = totals({ groceries: { "2026-01": -2000 } });

    expect(balanceFor("groceries", assigned, activity, utc(2026, 2))).toEqual({
      carriedIn: 3000,
      available: 3000,
    });
  });

  it("compounds positive leftovers across months", () => {
    // Jan +$60, Feb +$60, Mar nothing -> $120.
    const assigned = totals({ "cat-1": { "2026-01": 10000, "2026-02": 10000 } });
    const activity = totals({ "cat-1": { "2026-01": -4000, "2026-02": -4000 } });

    expect(balanceFor("cat-1", assigned, activity, utc(2026, 3)).available).toBe(12000);
  });

  it("shows overspending as negative in the month it happens", () => {
    // Jan: assigned $50, spent $80 -> -$30.
    const assigned = totals({ "cat-1": { "2026-01": 5000 } });
    const activity = totals({ "cat-1": { "2026-01": -8000 } });

    expect(balanceFor("cat-1", assigned, activity, utc(2026, 1)).available).toBe(-3000);
  });

  it("resets an overspent category to 0 at the next month", () => {
    // Jan -$30; Feb starts at 0, not -$30.
    const assigned = totals({ "cat-1": { "2026-01": 5000 } });
    const activity = totals({ "cat-1": { "2026-01": -8000 } });

    expect(balanceFor("cat-1", assigned, activity, utc(2026, 2))).toEqual({
      carriedIn: 0,
      available: 0,
    });
  });

  it("doesn't let an old overspend eat into a later month's assignment", () => {
    // Jan -$30; Mar assigned $40 -> $40 available, not $10.
    const assigned = totals({ "cat-1": { "2026-01": 5000, "2026-03": 4000 } });
    const activity = totals({ "cat-1": { "2026-01": -8000 } });

    expect(balanceFor("cat-1", assigned, activity, utc(2026, 3)).available).toBe(4000);
  });

  it("resets each month's overspend separately, keeping positive months' leftovers", () => {
    // Jan +$20; Feb spends $50 with $0 assigned -> -$30; Mar assigned $10 -> $10.
    const assigned = totals({ "cat-1": { "2026-01": 2000, "2026-03": 1000 } });
    const activity = totals({ "cat-1": { "2026-02": -5000 } });

    expect(balanceFor("cat-1", assigned, activity, utc(2026, 2)).available).toBe(-3000);
    expect(balanceFor("cat-1", assigned, activity, utc(2026, 3))).toEqual({
      carriedIn: 0,
      available: 1000,
    });
  });

  it("ignores months after the one asked for", () => {
    const assigned = totals({ "cat-1": { "2026-01": 5000, "2026-05": 9000 } });
    const activity = totals({ "cat-1": { "2026-04": -100 } });

    expect(balanceFor("cat-1", assigned, activity, utc(2026, 2)).available).toBe(5000);
  });

  it("keeps each category's rollover independent of the others", () => {
    const assigned = totals({ a: { "2026-01": 1000 }, b: { "2026-01": 1000 } });
    const activity = totals({ a: { "2026-01": -3000 }, b: { "2026-01": -500 } });

    expect(balanceFor("a", assigned, activity, utc(2026, 2)).available).toBe(0);
    expect(balanceFor("b", assigned, activity, utc(2026, 2)).available).toBe(500);
  });

  it("orders months correctly across a year boundary", () => {
    // Dec 2025 -$10 resets for Jan 2026; Jan assigned $5 -> $5.
    const assigned = totals({ "cat-1": { "2026-01": 500 } });
    const activity = totals({ "cat-1": { "2025-12": -1000 } });

    expect(balanceFor("cat-1", assigned, activity, utc(2026, 1)).available).toBe(500);
  });
});

describe("rowFor", () => {
  const assigned = totals({ "cat-1": { "2026-01": 5000, "2026-02": 2000 } });
  const activity = totals({ "cat-1": { "2026-01": -1000, "2026-02": -500 } });

  it("reports this month's budgeted and activity as given, with the rolled-over available and carry-in", () => {
    expect(
      rowFor({ id: "cat-1", name: "Groceries", budgeted: 2000, activity: -500 }, assigned, activity, utc(2026, 2)),
    ).toEqual({
      id: "cat-1",
      name: "Groceries",
      budgeted: 2000,
      activity: -500,
      carriedIn: 4000,
      available: 5500,
    });
  });

  it("shows the carried-in leftover for a category with nothing this month", () => {
    expect(
      rowFor({ id: "cat-1", name: "Groceries", budgeted: 0, activity: 0 }, assigned, activity, utc(2026, 3)),
    ).toMatchObject({ carriedIn: 5500, available: 5500 });
  });
});

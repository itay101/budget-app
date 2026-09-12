import { availableFor, rowFor } from "./budget";

describe("availableFor", () => {
  it("is the sum of budgeted-through-month and activity-through-month", () => {
    const budgetedThroughMonth = new Map([["cat-1", 5000]]);
    const activityThroughMonth = new Map([["cat-1", -1200]]);

    expect(availableFor("cat-1", budgetedThroughMonth, activityThroughMonth)).toBe(
      3800,
    );
  });

  it("defaults a category missing from either map to 0 for that side", () => {
    const budgetedThroughMonth = new Map([["cat-1", 5000]]);
    const activityThroughMonth = new Map<string, number>();

    expect(availableFor("cat-1", budgetedThroughMonth, activityThroughMonth)).toBe(
      5000,
    );
  });

  it("is 0 for a category present in neither map", () => {
    expect(availableFor("cat-unknown", new Map(), new Map())).toBe(0);
  });

  // The core YNAB-style rollover behavior: available is a running total
  // through the month, not just this month's budgeted + this month's
  // activity, so leftover from a prior month carries forward even when
  // this month's own budgeted/activity is 0.
  it("carries a prior month's leftover forward when nothing happens this month", () => {
    // Jan: budgeted $50, spent $20 -> $30 left over.
    // Feb: budgeted $0, spent $0 -> still $30 available, all from Jan.
    const budgetedThroughMonth = new Map([["groceries", 5000]]); // cumulative through Feb
    const activityThroughMonth = new Map([["groceries", -2000]]); // cumulative through Feb

    expect(
      availableFor("groceries", budgetedThroughMonth, activityThroughMonth),
    ).toBe(3000);
  });

  it("compounds rollover across three months of under-spending", () => {
    // Jan: budgeted $100, spent $40 -> $60 left.
    // Feb: budgeted $100, spent $40 -> $60 + $60 = $120 left.
    // Mar: budgeted $0, spent $0 -> still $120.
    // Cumulative through March: budgeted $200, activity -$80.
    const budgetedThroughMonth = new Map([["cat-1", 20000]]);
    const activityThroughMonth = new Map([["cat-1", -8000]]);

    expect(availableFor("cat-1", budgetedThroughMonth, activityThroughMonth)).toBe(
      12000,
    );
  });

  it("goes negative when a category is overspent, and stays negative until covered", () => {
    // Jan: budgeted $50, spent $80 -> -$30 available.
    const budgetedThroughMonth = new Map([["cat-1", 5000]]);
    const activityThroughMonth = new Map([["cat-1", -8000]]);

    expect(availableFor("cat-1", budgetedThroughMonth, activityThroughMonth)).toBe(
      -3000,
    );
  });

  it("recovers from an overspent balance once a later month's budgeted covers it", () => {
    // Jan: budgeted $50, spent $80 -> -$30.
    // Feb: budgeted $50, spent $0 -> -$30 + $50 = $20.
    // Cumulative through Feb: budgeted $100, activity -$80.
    const budgetedThroughMonth = new Map([["cat-1", 10000]]);
    const activityThroughMonth = new Map([["cat-1", -8000]]);

    expect(availableFor("cat-1", budgetedThroughMonth, activityThroughMonth)).toBe(
      2000,
    );
  });

  it("keeps each category's rollover independent of the others", () => {
    const budgetedThroughMonth = new Map([
      ["rent", 100000],
      ["fun", 2000],
    ]);
    const activityThroughMonth = new Map([
      ["rent", -100000],
      ["fun", -5000],
    ]);

    expect(availableFor("rent", budgetedThroughMonth, activityThroughMonth)).toBe(0);
    expect(availableFor("fun", budgetedThroughMonth, activityThroughMonth)).toBe(
      -3000,
    );
  });
});

describe("rowFor", () => {
  it("reports this month's budgeted/activity as given, and available as the running total", () => {
    const budgetedThroughMonth = new Map([["cat-1", 15000]]); // cumulative through this month
    const activityThroughMonth = new Map([["cat-1", -4000]]); // cumulative through this month

    const row = rowFor(
      { id: "cat-1", name: "Groceries", budgeted: 5000, activity: -1000 },
      budgetedThroughMonth,
      activityThroughMonth,
    );

    expect(row).toEqual({
      id: "cat-1",
      name: "Groceries",
      budgeted: 5000, // this month only, not the cumulative 15000
      activity: -1000, // this month only, not the cumulative -4000
      available: 11000, // 15000 + (-4000), the rolled-forward total
    });
  });

  it("shows rollover available even for a category with no budgeted/activity this month", () => {
    const budgetedThroughMonth = new Map([["cat-1", 6000]]);
    const activityThroughMonth = new Map([["cat-1", -1000]]);

    const row = rowFor(
      { id: "cat-1", name: "Gifts", budgeted: 0, activity: 0 },
      budgetedThroughMonth,
      activityThroughMonth,
    );

    expect(row.budgeted).toBe(0);
    expect(row.activity).toBe(0);
    expect(row.available).toBe(5000);
  });

  it("reflects an overspent category as negative available", () => {
    const budgetedThroughMonth = new Map([["cat-1", 3000]]);
    const activityThroughMonth = new Map([["cat-1", -5000]]);

    const row = rowFor(
      { id: "cat-1", name: "Dining Out", budgeted: 3000, activity: -5000 },
      budgetedThroughMonth,
      activityThroughMonth,
    );

    expect(row.available).toBe(-2000);
  });
});

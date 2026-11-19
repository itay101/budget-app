import {
  NEXT_MONTH_WARNING_CATEGORY_LIMIT,
  nextMonthWarning,
  type NextMonthWarningCategoryInput,
} from "./nextMonthWarning";

/** $50 left, a category $200 cash-overspent, no income dated next month. */
function example(
  overrides: Partial<Parameters<typeof nextMonthWarning>[0]> = {},
  category?: Partial<NextMonthWarningCategoryInput>,
) {
  return nextMonthWarning({
    isPast: false,
    readyToAssign: 50_000,
    nextMonthIncome: 0,
    categories: [
      {
        id: "food",
        name: "Groceries",
        cashOverspending: 200_000,
        ...category,
      },
    ],
    ...overrides,
  });
}

describe("nextMonthWarning", () => {
  it("is this month's Ready to Assign, minus cash overspending, plus next month's income", () => {
    // $50 − $200 + $0 = −$150.
    expect(example()).toMatchObject({ nextReadyToAssign: -150_000, cashOverspending: 200_000 });
    // $50 − $200 + $30 = −$120.
    expect(example({ nextMonthIncome: 30_000 })).toMatchObject({ nextReadyToAssign: -120_000 });
  });

  it("shows when this month is $0 or more and next month is below $0", () => {
    expect(example()).not.toBeNull();
    expect(example({ readyToAssign: 0 })).toMatchObject({ nextReadyToAssign: -200_000 });
  });

  it("stays hidden when this month is already negative", () => {
    expect(example({ readyToAssign: -1 })).toBeNull();
  });

  it("stays hidden when next month is $0 or more", () => {
    expect(example({ nextMonthIncome: 150_000 })).toBeNull();
    expect(example({ nextMonthIncome: 200_000 })).toBeNull();
    expect(example({ categories: [] })).toBeNull();
  });

  it("stays hidden in a past month", () => {
    expect(example({ isPast: true })).toBeNull();
  });

  it("ignores Credit Overspending, including a mixed overspend's credit part", () => {
    expect(
      example({}, { cashOverspending: 0, creditOverspending: 200_000 }),
    ).toBeNull();

    const warning = example({}, { cashOverspending: 200_000, creditOverspending: 500_000 });
    expect(warning).toMatchObject({
      nextReadyToAssign: -150_000,
      cashOverspending: 200_000,
      categories: [{ id: "food", cashOverspending: 200_000 }],
    });
  });

  it("lists hidden categories and Uncategorized along with the others", () => {
    const warning = nextMonthWarning({
      isPast: false,
      readyToAssign: 50_000,
      nextMonthIncome: 0,
      categories: [
        { id: "food", name: "Groceries", cashOverspending: 80_000 },
        { id: "gym", name: "Gym", cashOverspending: 70_000 },
        { id: "__uncategorized__", name: "Uncategorized", cashOverspending: 50_000, uncategorized: true },
      ],
    });
    expect(warning).toMatchObject({
      cashOverspending: 200_000,
      nextReadyToAssign: -150_000,
      categories: [
        { id: "food", uncategorized: false },
        { id: "gym", uncategorized: false },
        { id: "__uncategorized__", uncategorized: true },
      ],
    });
  });

  it("lists at most five categories and reports how many remain, in the order given", () => {
    const categories = Array.from({ length: NEXT_MONTH_WARNING_CATEGORY_LIMIT + 2 }, (_, i) => {
      const name = String.fromCharCode(65 + i);
      return { id: name, name, cashOverspending: (i + 1) * 1_000 };
    });
    const warning = nextMonthWarning({
      isPast: false,
      readyToAssign: 0,
      nextMonthIncome: 0,
      categories,
    });
    expect(warning?.categories.map((c) => c.id)).toEqual(["A", "B", "C", "D", "E"]);
    expect(warning?.moreCount).toBe(2);
    // 1+2+…+7 thousand.
    expect(warning?.cashOverspending).toBe(28_000);
  });

  it("leaves next month unchanged when Ready to Assign covers the overspending", () => {
    const before = example();
    // Assigning $50 from Ready to Assign lowers both figures by $50.
    const after = example({ readyToAssign: 0 }, { cashOverspending: 150_000 });
    expect(after?.nextReadyToAssign).toBe(before?.nextReadyToAssign);
    expect(after?.nextReadyToAssign).toBe(-150_000);
  });

  it("clears when money moves in from another category and covers the gap", () => {
    // $200 covered from another category: Ready to Assign stays $50, cash overspending is gone.
    expect(example({ categories: [{ id: "food", name: "Groceries", cashOverspending: 0 }] })).toBeNull();
    // Covering down to the $50 that's left brings next month to $0, which is not a warning.
    expect(example({}, { cashOverspending: 50_000 })).toBeNull();
  });
});

import { showUncategorizedRow, uncategorizedAvailableClass, uncategorizedNudge } from "./uncategorizedRow";

// #182 / #225: the pinned row shows when this month has transactions that
// still need a category, or when Available isn't zero. Amounts are milliunits.
describe("showUncategorizedRow", () => {
  it("hides the row when this month has no uncategorized transactions and Available is zero", () => {
    expect(showUncategorizedRow(0, 0)).toBe(false);
  });

  it("shows the row when transactions net to zero, because they still need a category", () => {
    expect(showUncategorizedRow(2, 0)).toBe(true);
  });

  it("shows the row when a positive Available has carried over and nothing happened this month", () => {
    expect(showUncategorizedRow(0, 30_000)).toBe(true);
  });

  it("shows the row when Available is cash overspending", () => {
    expect(showUncategorizedRow(1, -12_500)).toBe(true);
  });
});

describe("uncategorizedAvailableClass", () => {
  it("is red for cash overspending, grey for a positive balance, and green at zero", () => {
    expect(uncategorizedAvailableClass(-1)).toBe("text-danger");
    expect(uncategorizedAvailableClass(30_000)).toBe("text-neutral-600");
    expect(uncategorizedAvailableClass(0)).toBe("text-success");
  });
});

describe("uncategorizedNudge", () => {
  it("uses the spec's plural, and 'needs' for a single transaction", () => {
    expect(uncategorizedNudge(0)).toBe("0 need a category");
    expect(uncategorizedNudge(1)).toBe("1 needs a category");
    expect(uncategorizedNudge(2)).toBe("2 need a category");
  });
});

import {
  addMonths,
  clampMonth,
  currentBudgetMonth,
  formatBudgetMonth,
  isInRange,
  monthDateRange,
  monthLabel,
  navigableRange,
  parseBudgetMonth,
  resolveViewedMonth,
} from "./budgetMonth";

// Jest runs with TZ=Asia/Jerusalem, so any accidental local-time math shows
// up as an off-by-one month in these tests.
const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d));

describe("parseBudgetMonth", () => {
  it("parses YYYY-MM into the UTC first of that month", () => {
    expect(parseBudgetMonth("2026-03")).toEqual(utc(2026, 3));
    expect(parseBudgetMonth("2026-12")).toEqual(utc(2026, 12));
  });

  it.each(["", "2026-3", "2026-13", "2026-00", "26-03", "2026-03-01", "abcd-ef", " 2026-03"])(
    "rejects %j",
    (input) => {
      expect(parseBudgetMonth(input)).toBeNull();
    },
  );
});

describe("formatBudgetMonth", () => {
  it("formats a date as its UTC YYYY-MM", () => {
    expect(formatBudgetMonth(utc(2026, 3))).toBe("2026-03");
    // 23:30 UTC on Mar 31 is already April in Jerusalem, but still March in UTC.
    expect(formatBudgetMonth(new Date(Date.UTC(2026, 2, 31, 23, 30)))).toBe("2026-03");
  });

  it("round-trips with parseBudgetMonth", () => {
    expect(formatBudgetMonth(parseBudgetMonth("2027-01")!)).toBe("2027-01");
  });
});

describe("currentBudgetMonth", () => {
  it("is the UTC first of the month containing now", () => {
    expect(currentBudgetMonth(new Date(Date.UTC(2026, 9, 10, 8, 0)))).toEqual(utc(2026, 10));
  });

  it("uses the UTC month, not the local one, at a month turn", () => {
    // 22:30 UTC on Oct 31 is Nov 1 in Jerusalem; the Budget Month is still October.
    expect(currentBudgetMonth(new Date(Date.UTC(2026, 9, 31, 22, 30)))).toEqual(utc(2026, 10));
  });
});

describe("addMonths", () => {
  it("moves forward and back across year boundaries", () => {
    expect(addMonths(utc(2026, 11), 2)).toEqual(utc(2027, 1));
    expect(addMonths(utc(2026, 1), -1)).toEqual(utc(2025, 12));
    expect(addMonths(utc(2026, 5), 0)).toEqual(utc(2026, 5));
  });
});

describe("navigableRange", () => {
  const current = utc(2026, 10);

  it("starts at the budget's creation month when nothing is earlier", () => {
    const range = navigableRange({ budgetCreatedAt: new Date(Date.UTC(2026, 7, 15, 12)) }, current);
    expect(range.first).toEqual(utc(2026, 8));
  });

  it("starts at the earliest of creation, first transaction and first assignment", () => {
    const range = navigableRange(
      {
        budgetCreatedAt: utc(2026, 8, 15),
        earliestTransaction: utc(2026, 5, 20),
        earliestAssignment: utc(2026, 6),
      },
      current,
    );
    expect(range.first).toEqual(utc(2026, 5));
  });

  it("ends 12 months after the current month", () => {
    const range = navigableRange({ budgetCreatedAt: utc(2026, 1) }, current);
    expect(range.last).toEqual(utc(2027, 10));
  });

  it("extends the end to the latest month that already has money assigned", () => {
    const range = navigableRange(
      { budgetCreatedAt: utc(2026, 1), latestAssignment: utc(2028, 2) },
      current,
    );
    expect(range.last).toEqual(utc(2028, 2));
  });

  it("never starts after the current month", () => {
    // A budget whose only data is future-dated still reaches the current month.
    const range = navigableRange(
      { budgetCreatedAt: utc(2026, 10, 5), earliestAssignment: utc(2026, 12) },
      current,
    );
    expect(range.first).toEqual(utc(2026, 10));
  });
});

describe("isInRange and clampMonth", () => {
  const range = { first: utc(2026, 3), last: utc(2027, 10) };

  it("accepts the range's ends and anything between", () => {
    expect(isInRange(utc(2026, 3), range)).toBe(true);
    expect(isInRange(utc(2027, 10), range)).toBe(true);
    expect(isInRange(utc(2026, 9), range)).toBe(true);
  });

  it("rejects months outside the range", () => {
    expect(isInRange(utc(2026, 2), range)).toBe(false);
    expect(isInRange(utc(2027, 11), range)).toBe(false);
  });

  it("clamps to the nearest end", () => {
    expect(clampMonth(utc(2020, 1), range)).toEqual(utc(2026, 3));
    expect(clampMonth(utc(2030, 1), range)).toEqual(utc(2027, 10));
    expect(clampMonth(utc(2026, 9), range)).toEqual(utc(2026, 9));
  });
});

describe("monthLabel", () => {
  it("names the UTC month", () => {
    expect(monthLabel(utc(2026, 10))).toBe("October 2026");
    expect(monthLabel(utc(2026, 10), "short")).toBe("Oct 2026");
  });
});

describe("monthDateRange", () => {
  it("gives the first and last day as YYYY-MM-DD", () => {
    expect(monthDateRange(utc(2026, 2))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthDateRange(utc(2028, 2))).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthDateRange(utc(2026, 12))).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("resolveViewedMonth", () => {
  const range = { first: utc(2026, 3), last: utc(2027, 10) };
  const current = utc(2026, 10);

  it("shows the current month when no month is given", () => {
    expect(resolveViewedMonth(undefined, range, current)).toEqual({ month: current });
  });

  it("shows the current month for a malformed or repeated param", () => {
    expect(resolveViewedMonth("2026-9", range, current)).toEqual({ month: current });
    expect(resolveViewedMonth(["2026-09", "2026-10"], range, current)).toEqual({ month: current });
  });

  it("shows an in-range month as is", () => {
    expect(resolveViewedMonth("2026-04", range, current)).toEqual({ month: utc(2026, 4) });
  });

  it("redirects an out-of-range month to the nearest end", () => {
    expect(resolveViewedMonth("2020-01", range, current)).toEqual({ redirectTo: utc(2026, 3) });
    expect(resolveViewedMonth("2030-01", range, current)).toEqual({ redirectTo: utc(2027, 10) });
  });
});

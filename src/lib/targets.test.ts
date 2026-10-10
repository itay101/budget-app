import {
  effectiveTarget,
  matchesQuickFilter,
  needFor,
  planTotals,
  targetStatus,
  type Target,
  type TargetRow,
} from "./targets";

// ADR 0011. Amounts in milliunits; months are UTC firsts.
const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d));
const $ = (dollars: number) => Math.round(dollars * 1000);

function target(partial: Partial<Target> & Pick<Target, "kind">): Target {
  return { cadence: null, amount: 0, weekday: null, dueDay: null, dueDate: null, ...partial };
}

const monthlySetAside = target({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: $(400) });
const monthlyRefill = target({ kind: "REFILL", cadence: "MONTHLY", amount: $(400) });

describe("effectiveTarget", () => {
  const rows: TargetRow[] = [
    { ...monthlySetAside, startMonth: utc(2026, 1) },
    { ...monthlyRefill, startMonth: utc(2026, 5) },
    { ...target({ kind: "NONE" }), startMonth: utc(2026, 9) },
  ];

  it("is the latest row starting on or before the month", () => {
    expect(effectiveTarget(rows, utc(2026, 3))?.kind).toBe("SET_ASIDE");
    expect(effectiveTarget(rows, utc(2026, 5))?.kind).toBe("REFILL");
    expect(effectiveTarget(rows, utc(2026, 8))?.kind).toBe("REFILL");
  });

  it("is null before the first row, and from a NONE row on", () => {
    expect(effectiveTarget(rows, utc(2025, 12))).toBeNull();
    expect(effectiveTarget(rows, utc(2026, 9))).toBeNull();
    expect(effectiveTarget(rows, utc(2027, 1))).toBeNull();
  });

  it("doesn't depend on the rows' order", () => {
    expect(effectiveTarget([...rows].reverse(), utc(2026, 6))?.kind).toBe("REFILL");
  });

  it("is null for a row missing what its cadence needs, rather than guessing", () => {
    const at = (t: Target) => effectiveTarget([{ ...t, startMonth: utc(2026, 1) }], utc(2026, 3));
    expect(at(target({ kind: "SET_ASIDE", cadence: "YEARLY", amount: $(1200) }))).toBeNull();
    expect(at(target({ kind: "SET_ASIDE", cadence: "WEEKLY", amount: $(100) }))).toBeNull();
    expect(at(target({ kind: "REFILL", amount: $(100) }))).toBeNull();
    expect(at(target({ kind: "BALANCE", amount: $(100) }))?.kind).toBe("BALANCE");
  });
});

describe("needFor", () => {
  const oct = utc(2026, 10);

  describe("monthly set aside", () => {
    it("asks for the amount and ignores what was carried in", () => {
      expect(needFor(monthlySetAside, { carriedIn: $(1000), assigned: $(100) }, oct)).toMatchObject({
        ask: $(400),
        needed: $(300),
      });
    });

    it("needs nothing once assigned covers it, with a floor of 0", () => {
      expect(needFor(monthlySetAside, { carriedIn: 0, assigned: $(500) }, oct).needed).toBe(0);
    });
  });

  describe("monthly refill up to", () => {
    it("counts what was carried in toward the amount", () => {
      expect(needFor(monthlyRefill, { carriedIn: $(150), assigned: $(100) }, oct)).toMatchObject({
        ask: $(250),
        needed: $(150),
      });
    });

    it("asks for nothing when the carry-in already reaches the amount", () => {
      expect(needFor(monthlyRefill, { carriedIn: $(500), assigned: 0 }, oct)).toMatchObject({
        ask: 0,
        needed: 0,
      });
    });
  });

  describe("weekly", () => {
    // October 2026 has five Fridays (2, 9, 16, 23, 30) and four Mondays.
    it("multiplies the amount by the number of that weekday in the month", () => {
      const fridays = target({ kind: "SET_ASIDE", cadence: "WEEKLY", amount: $(100), weekday: 5 });
      const mondays = target({ kind: "SET_ASIDE", cadence: "WEEKLY", amount: $(100), weekday: 1 });
      expect(needFor(fridays, { carriedIn: 0, assigned: 0 }, oct).ask).toBe($(500));
      expect(needFor(mondays, { carriedIn: 0, assigned: 0 }, oct).ask).toBe($(400));
    });

    it("counts the weekday in a 28-day, a leap and a 30-day month", () => {
      const weekly = (weekday: number) =>
        target({ kind: "SET_ASIDE", cadence: "WEEKLY", amount: $(100), weekday });
      const ask = (weekday: number, month: Date) => needFor(weekly(weekday), { carriedIn: 0, assigned: 0 }, month).ask;
      // Feb 2026 starts on a Sunday: four of every weekday.
      for (let day = 0; day < 7; day++) expect(ask(day, utc(2026, 2))).toBe($(400));
      // Feb 2028 starts on a Tuesday and has 29 days: five Tuesdays.
      expect(ask(2, utc(2028, 2))).toBe($(500));
      expect(ask(3, utc(2028, 2))).toBe($(400));
      // Sep 2026 starts on a Tuesday and has 30 days: five Tuesdays and Wednesdays.
      expect(ask(2, utc(2026, 9))).toBe($(500));
      expect(ask(3, utc(2026, 9))).toBe($(500));
      expect(ask(4, utc(2026, 9))).toBe($(400));
    });

    it("applies the refill rule to the weekly total", () => {
      const refill = target({ kind: "REFILL", cadence: "WEEKLY", amount: $(100), weekday: 5 });
      expect(needFor(refill, { carriedIn: $(120), assigned: $(80) }, oct).needed).toBe($(300));
    });
  });

  describe("yearly refill up to", () => {
    const yearly = target({ kind: "REFILL", cadence: "YEARLY", amount: $(3600), dueDate: utc(2027, 3, 1) });

    it("spreads what's still to fund over the months left to the due month, counting this one", () => {
      // Oct..Mar = 6 months; $3,600 - $1,800 carried in = $1,800 -> $300 a month.
      expect(needFor(yearly, { carriedIn: $(1800), assigned: $(100) }, oct)).toMatchObject({
        ask: $(300),
        needed: $(200),
        goal: { have: $(1900), amount: $(3600) },
      });
    });

    it("asks for the whole remainder in the due month", () => {
      expect(needFor(yearly, { carriedIn: $(3000), assigned: 0 }, utc(2027, 3)).ask).toBe($(600));
    });

    it("starts the next cycle the month after the due date", () => {
      // April 2027: next due is March 2028, 12 months away including April.
      expect(needFor(yearly, { carriedIn: 0, assigned: 0 }, utc(2027, 4)).ask).toBe($(300));
    });

    it("repeats the due date every year even when it was stored for an earlier year", () => {
      const old = target({ kind: "REFILL", cadence: "YEARLY", amount: $(1200), dueDate: utc(2024, 12, 15) });
      // Oct..Dec 2026 = 3 months.
      expect(needFor(old, { carriedIn: 0, assigned: 0 }, oct).ask).toBe($(400));
    });

    it("rounds the monthly split up to the cent", () => {
      const odd = target({ kind: "REFILL", cadence: "YEARLY", amount: $(100), dueDate: utc(2026, 12, 1) });
      // $100 / 3 = $33.333... -> $33.34
      expect(needFor(odd, { carriedIn: 0, assigned: 0 }, oct).ask).toBe($(33.34));
    });
  });

  describe("yearly set aside", () => {
    // Cycle Apr 2026 - Mar 2027 (due Mar 1, 2027).
    const yearly = target({ kind: "SET_ASIDE", cadence: "YEARLY", amount: $(3600), dueDate: utc(2027, 3, 1) });
    const sixMonthsOf300 = new Map(
      ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((k) => [k, $(300)]),
    );

    it("counts what was assigned earlier this cycle, not the balance", () => {
      // $1,800 set aside Apr..Sep; $1,300 of it already spent (carried in $500).
      expect(
        needFor(yearly, { carriedIn: $(500), assigned: $(100), assignedByMonth: sixMonthsOf300 }, oct),
      ).toMatchObject({ ask: $(300), needed: $(200), goal: { have: $(1900), amount: $(3600) } });
    });

    it("doesn't count last cycle's assignments or leftover toward the new cycle", () => {
      const lastCycle = new Map([...sixMonthsOf300, ["2026-10", $(1800)]]);
      // April 2027 starts a new cycle: $3,600 over 12 months, despite $1,000 carried in.
      expect(
        needFor(yearly, { carriedIn: $(1000), assigned: 0, assignedByMonth: lastCycle }, utc(2027, 4)).ask,
      ).toBe($(300));
    });

    it("ignores this month's own assignment in the ask", () => {
      const withOct = new Map([...sixMonthsOf300, ["2026-10", $(100)]]);
      expect(
        needFor(yearly, { carriedIn: 0, assigned: $(100), assignedByMonth: withOct }, oct).ask,
      ).toBe($(300));
    });

    it("asks the full split when nothing was assigned this cycle", () => {
      expect(needFor(yearly, { carriedIn: $(5000), assigned: 0 }, oct).ask).toBe($(600));
    });
  });

  describe("have a balance of", () => {
    it("spreads a dated balance over the months left to its due month", () => {
      const dated = target({ kind: "BALANCE", amount: $(12000), dueDate: utc(2027, 6, 1) });
      // Oct..Jun = 9 months; ($12,000 - $5,000) / 9 = $777.777... -> $777.78
      expect(needFor(dated, { carriedIn: $(5000), assigned: 0 }, oct)).toMatchObject({
        ask: $(777.78),
        needed: $(777.78),
        goal: { have: $(5000), amount: $(12000) },
      });
    });

    it("asks for the whole remainder once the due month has passed", () => {
      const pastDue = target({ kind: "BALANCE", amount: $(1000), dueDate: utc(2026, 6, 1) });
      expect(needFor(pastDue, { carriedIn: $(400), assigned: $(100) }, oct)).toMatchObject({
        ask: $(600),
        needed: $(500),
      });
    });

    it("asks an undated balance for whatever is missing", () => {
      const undated = target({ kind: "BALANCE", amount: $(20000) });
      expect(needFor(undated, { carriedIn: $(19000), assigned: $(500) }, oct)).toMatchObject({
        ask: $(1000),
        needed: $(500),
      });
    });
  });

  it("needs nothing while snoozed, but keeps the ask (it still counts toward Cost to Be Me)", () => {
    expect(needFor(monthlySetAside, { carriedIn: 0, assigned: 0, snoozed: true }, oct)).toMatchObject({
      ask: $(400),
      needed: 0,
    });
  });
});

describe("targetStatus", () => {
  const oct = utc(2026, 10);
  const status = (t: Target | null, f: { carriedIn: number; assigned: number; available: number; snoozed?: boolean }) =>
    targetStatus(t, t ? needFor(t, f, oct) : null, f);

  it("is overspent whenever Available is negative, target or not", () => {
    expect(status(monthlySetAside, { carriedIn: 0, assigned: $(400), available: $(-50) })).toBe("overspent");
    expect(status(null, { carriedIn: 0, assigned: 0, available: $(-1) })).toBe("overspent");
  });

  it("is none without a target", () => {
    expect(status(null, { carriedIn: 0, assigned: 0, available: $(10) })).toBe("none");
  });

  it("is snoozed while snoozed", () => {
    expect(status(monthlySetAside, { carriedIn: 0, assigned: 0, available: 0, snoozed: true })).toBe("snoozed");
  });

  it("is underfunded while money is still needed", () => {
    expect(status(monthlySetAside, { carriedIn: 0, assigned: $(100), available: $(100) })).toBe("underfunded");
  });

  it("is funded when exactly covered", () => {
    expect(status(monthlySetAside, { carriedIn: 0, assigned: $(400), available: $(400) })).toBe("funded");
  });

  it("is overfunded when more is assigned than this month asks", () => {
    expect(status(monthlySetAside, { carriedIn: 0, assigned: $(450), available: $(450) })).toBe("overfunded");
  });

  it("is overfunded when a balance target is already past its goal", () => {
    const undated = target({ kind: "BALANCE", amount: $(1000) });
    expect(status(undated, { carriedIn: $(1200), assigned: 0, available: $(1200) })).toBe("overfunded");
  });

  it("is on track when this month is covered but the whole goal isn't reached yet", () => {
    const yearly = target({ kind: "REFILL", cadence: "YEARLY", amount: $(3600), dueDate: utc(2027, 3, 1) });
    expect(status(yearly, { carriedIn: $(1800), assigned: $(300), available: $(2100) })).toBe("on_track");
  });
});

describe("planTotals", () => {
  it("sums needed (hidden included), adds overspending into Underfunded, and leaves undated balances out of Cost to Be Me", () => {
    const oct = utc(2026, 10);
    const undated = target({ kind: "BALANCE", amount: $(1000) });
    const rows = [
      { target: monthlySetAside, funding: { carriedIn: 0, assigned: $(100) }, available: $(100), hidden: false },
      { target: monthlySetAside, funding: { carriedIn: 0, assigned: 0 }, available: 0, hidden: true },
      { target: monthlySetAside, funding: { carriedIn: 0, assigned: 0, snoozed: true }, available: 0, hidden: false },
      { target: undated, funding: { carriedIn: 0, assigned: 0 }, available: 0, hidden: false },
      { target: null, funding: { carriedIn: 0, assigned: 0 }, available: $(-75), hidden: false },
    ].map((r) => ({ ...r, need: r.target ? needFor(r.target, r.funding, oct) : null }));

    expect(planTotals(rows)).toEqual({
      needed: $(300) + $(400) + $(1000),
      overspending: $(75),
      underfunded: $(300) + $(400) + $(1000) + $(75),
      costToBeMe: $(400) * 3,
    });
  });
});

describe("matchesQuickFilter", () => {
  const row = (over: Partial<Parameters<typeof matchesQuickFilter>[1]>) => ({
    hidden: false,
    available: 0,
    status: "none" as const,
    needed: 0,
    snoozed: false,
    ...over,
  });

  it("All shows visible categories only", () => {
    expect(matchesQuickFilter("all", row({}))).toBe(true);
    expect(matchesQuickFilter("all", row({ hidden: true }))).toBe(false);
  });

  it("the other filters include hidden categories", () => {
    expect(matchesQuickFilter("underfunded", row({ hidden: true, needed: 1 }))).toBe(true);
    expect(matchesQuickFilter("snoozed", row({ hidden: true, status: "snoozed", snoozed: true }))).toBe(true);
  });

  it("Snoozed keeps a snoozed category that is overspent", () => {
    expect(matchesQuickFilter("snoozed", row({ status: "overspent", snoozed: true }))).toBe(true);
    expect(matchesQuickFilter("snoozed", row({ status: "overspent" }))).toBe(false);
  });

  it("Underfunded is needed > 0, including an overspent category that is still short", () => {
    expect(matchesQuickFilter("underfunded", row({ status: "overspent", needed: 1 }))).toBe(true);
    expect(matchesQuickFilter("underfunded", row({ status: "funded" }))).toBe(false);
  });

  it("Overfunded and Money Available follow status and Available", () => {
    expect(matchesQuickFilter("overfunded", row({ status: "overfunded" }))).toBe(true);
    expect(matchesQuickFilter("available", row({ available: 1 }))).toBe(true);
    expect(matchesQuickFilter("available", row({ available: 0 }))).toBe(false);
  });
});

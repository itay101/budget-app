import {
  describeTarget,
  dueLabel,
  filterRows,
  budgetTable,
  historyRanges,
  overspendBar,
  parseQuickFilter,
  QUICK_FILTERS,
  quickFilterCounts,
  targetAsOf,
  targetProgress,
  totalNeeded,
  underfundedBanner,
  type FilterableRow,
} from "./targetDisplay";
import { needFor, type Target, type TargetNeed } from "./targets";

// #171. Amounts in milliunits; months are UTC firsts.
const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d));
const $ = (dollars: number) => Math.round(dollars * 1000);
const fmt = (milliunits: number) => `$${milliunits / 1000}`;

function target(partial: Partial<Target> & Pick<Target, "kind">): Target {
  return { cadence: null, amount: 0, weekday: null, dueDay: null, dueDate: null, ...partial };
}

const oct = utc(2026, 10);

describe("describeTarget", () => {
  it.each([
    [target({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: $(400) }), "Set aside $400 each month"],
    [target({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: $(400), dueDay: 15 }), "Set aside $400 each month, by the 15th"],
    [target({ kind: "REFILL", cadence: "MONTHLY", amount: $(400), dueDay: 22 }), "Refill up to $400 each month, by the 22nd"],
    [target({ kind: "SET_ASIDE", cadence: "WEEKLY", amount: $(50), weekday: 1 }), "Set aside $50 every Monday"],
    [target({ kind: "SET_ASIDE", cadence: "YEARLY", amount: $(1200), dueDate: utc(2027, 3, 15) }), "Set aside $1200 every year, due Mar 15"],
    [target({ kind: "BALANCE", amount: $(5000), dueDate: utc(2027, 3) }), "Have a balance of $5000 by March 2027"],
    [target({ kind: "BALANCE", amount: $(5000) }), "Have a balance of $5000"],
  ])("describes %o", (t, text) => {
    expect(describeTarget(t, fmt)).toBe(text);
  });

  it("says No target for none or a NONE row", () => {
    expect(describeTarget(null, fmt)).toBe("No target");
    expect(describeTarget(target({ kind: "NONE" }), fmt)).toBe("No target");
  });
});

describe("dueLabel", () => {
  it("clamps a monthly due day to the month's last day", () => {
    const t = target({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: $(1), dueDay: 31 });
    expect(dueLabel(t, oct)).toBe("by the 31st");
    expect(dueLabel(t, utc(2026, 2))).toBe("by the 28th");
    expect(dueLabel(t, utc(2026, 11))).toBe("by the 30th");
  });

  it("is 'this month' for a monthly target without a due day", () => {
    expect(dueLabel(target({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: $(1) }), oct)).toBe("this month");
  });

  it("names a weekly target's weekday", () => {
    expect(dueLabel(target({ kind: "REFILL", cadence: "WEEKLY", amount: $(1), weekday: 5 }), oct)).toBe("every Friday");
  });

  it("shows a yearly target's next due date in or after the month", () => {
    const t = target({ kind: "SET_ASIDE", cadence: "YEARLY", amount: $(1), dueDate: utc(2024, 3, 15) });
    expect(dueLabel(t, oct)).toBe("due Mar 15, 2027");
    expect(dueLabel(t, utc(2027, 3))).toBe("due Mar 15, 2027");
    expect(dueLabel(t, utc(2027, 4))).toBe("due Mar 15, 2028");
  });

  it("clamps a 29 February due date in a non-leap year", () => {
    const t = target({ kind: "SET_ASIDE", cadence: "YEARLY", amount: $(1), dueDate: utc(2028, 2, 29) });
    expect(dueLabel(t, oct)).toBe("due Feb 28, 2027");
  });

  it("shows a balance target's due month, or no date", () => {
    expect(dueLabel(target({ kind: "BALANCE", amount: $(1), dueDate: utc(2027, 3) }), oct)).toBe("by Mar 2027");
    expect(dueLabel(target({ kind: "BALANCE", amount: $(1) }), oct)).toBe("no date");
  });
});

describe("targetProgress", () => {
  function progressFor(t: Target, numbers: { carriedIn?: number; budgeted?: number }, month = oct) {
    const carriedIn = numbers.carriedIn ?? 0;
    const budgeted = numbers.budgeted ?? 0;
    const need = needFor(t, { carriedIn, assigned: budgeted }, month);
    return targetProgress({ target: t, need, carriedIn, budgeted, available: carriedIn + budgeted }, month);
  }

  it("is null without a target", () => {
    expect(targetProgress({ target: null, need: null, carriedIn: 0, budgeted: 0, available: 0 }, oct)).toBeNull();
  });

  it("counts a Set aside's assignment against the month's amount", () => {
    const t = target({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: $(400) });
    expect(progressFor(t, { carriedIn: $(100), budgeted: $(250) })).toEqual({ have: $(250), of: $(400), fraction: 0.625 });
  });

  it("counts a weekly target's amount once per weekday in the month", () => {
    // October 2026 has five Thursdays.
    const t = target({ kind: "SET_ASIDE", cadence: "WEEKLY", amount: $(10), weekday: 4 });
    expect(progressFor(t, { budgeted: $(20) })).toMatchObject({ have: $(20), of: $(50) });
  });

  it("counts a Refill's carry-in toward its amount", () => {
    const t = target({ kind: "REFILL", cadence: "MONTHLY", amount: $(400) });
    expect(progressFor(t, { carriedIn: $(300), budgeted: $(50) })).toEqual({ have: $(350), of: $(400), fraction: 0.875 });
  });

  it("caps the fill at a full bar when overfunded", () => {
    const t = target({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: $(400) });
    expect(progressFor(t, { budgeted: $(500) })).toMatchObject({ have: $(500), fraction: 1 });
  });

  it("counts an undated balance's whole balance", () => {
    const t = target({ kind: "BALANCE", amount: $(1000) });
    expect(progressFor(t, { carriedIn: $(600), budgeted: $(150) })).toMatchObject({ have: $(750), of: $(1000) });
  });

  it("counts a dated balance's assignment against this month's ask", () => {
    // ($1,000 - $400) over Oct..Mar (6 months) = $100.
    const t = target({ kind: "BALANCE", amount: $(1000), dueDate: utc(2027, 3) });
    expect(progressFor(t, { carriedIn: $(400), budgeted: $(50) })).toEqual({ have: $(50), of: $(100), fraction: 0.5 });
  });

  it("shows the whole target once a yearly or balance target asks nothing this month", () => {
    const t = target({ kind: "BALANCE", amount: $(1000), dueDate: utc(2027, 3) });
    expect(progressFor(t, { carriedIn: $(1200) })).toEqual({ have: $(1200), of: $(1000), fraction: 1 });
  });

  it("is a full bar when there's nothing to fund against", () => {
    const t = target({ kind: "BALANCE", amount: $(1000), dueDate: utc(2027, 3) });
    const need: TargetNeed = { ask: 0, needed: 0 };
    expect(targetProgress({ target: t, need, carriedIn: 0, budgeted: 0, available: 0 }, oct)).toEqual({ have: 0, of: 0, fraction: 1 });
  });
});

describe("overspendBar", () => {
  it("is null unless Available is below 0", () => {
    expect(overspendBar({ carriedIn: 0, budgeted: $(10), available: 0 }, fmt)).toBeNull();
  });

  it("puts 100% at what covered the spending and labels the excess", () => {
    // $600 covered, $750 spent: 100% sits at 80% of the bar.
    const bar = overspendBar({ carriedIn: $(200), budgeted: $(400), available: $(-150) }, fmt);
    expect(bar).toEqual({ coveredPct: 80, excessLabel: "+$150 · 125%" });
  });

  it("drops the percentage when nothing covered it", () => {
    expect(overspendBar({ carriedIn: 0, budgeted: 0, available: $(-40) }, fmt)).toEqual({ coveredPct: 0, excessLabel: "+$40" });
  });
});

describe("quick filters", () => {
  const need = (needed: number, ask = needed): TargetNeed => ({ ask, needed });
  const rows: (FilterableRow & { id: string })[] = [
    { id: "rent", hidden: false, available: 0, status: "underfunded", need: need($(100)), snoozed: false },
    { id: "gym", hidden: true, available: 0, status: "underfunded", need: need($(30)), snoozed: false },
    { id: "gifts", hidden: false, available: $(20), status: "snoozed", need: need(0, $(50)), snoozed: true },
    { id: "fun", hidden: false, available: $(90), status: "overfunded", need: need(0, $(50)), snoozed: false },
    { id: "car", hidden: false, available: $(-10), status: "overspent", need: need($(10)), snoozed: false },
    { id: "old", hidden: true, available: $(5), status: "none", need: null, snoozed: false },
  ];
  const ids = (list: { id: string }[]) => list.map((row) => row.id);

  it("shows the visible rows under All and includes hidden ones elsewhere", () => {
    expect(ids(filterRows("all", rows))).toEqual(["rent", "gifts", "fun", "car"]);
    expect(ids(filterRows("underfunded", rows))).toEqual(["rent", "gym", "car"]);
    expect(ids(filterRows("snoozed", rows))).toEqual(["gifts"]);
    expect(ids(filterRows("overfunded", rows))).toEqual(["fun"]);
    expect(ids(filterRows("available", rows))).toEqual(["gifts", "fun", "old"]);
  });

  it("counts exactly the rows each filter shows", () => {
    const counts = quickFilterCounts(rows);
    for (const { key } of QUICK_FILTERS) expect(counts[key]).toBe(filterRows(key, rows).length);
  });

  it("parses ?filter=, falling back to All", () => {
    expect(parseQuickFilter("underfunded")).toBe("underfunded");
    expect(parseQuickFilter("available")).toBe("available");
    expect(parseQuickFilter("bogus")).toBe("all");
    expect(parseQuickFilter(["snoozed"])).toBe("all");
    expect(parseQuickFilter(undefined)).toBe("all");
  });

  it("summarises the banner: underfunded rows, how many are hidden, snoozed ones skipped", () => {
    expect(underfundedBanner(rows)).toEqual({ count: 3, hidden: 1, snoozed: 1 });
  });

  it("totals what a set of rows still needs", () => {
    expect(totalNeeded(rows)).toBe($(140));
    expect(totalNeeded([])).toBe(0);
  });
});

describe("target history", () => {
  const setAside = target({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: $(500) });
  const refill = target({ kind: "REFILL", cadence: "MONTHLY", amount: $(600) });
  const history = [
    { startMonth: "2026-10", target: refill },
    { startMonth: "2026-08", target: null },
    { startMonth: "2026-06", target: setAside },
  ];

  it("finds the target in effect in a month", () => {
    expect(targetAsOf(history, "2026-07")).toBe(setAside);
    expect(targetAsOf(history, "2026-09")).toBeNull();
    expect(targetAsOf(history, "2026-12")).toBe(refill);
    expect(targetAsOf(history, "2026-05")).toBeNull();
  });

  it("labels the months each row covered", () => {
    expect(historyRanges(history).map((entry) => entry.range)).toEqual([
      "October 2026 onwards",
      "August 2026 – September 2026",
      "June 2026 – July 2026",
    ]);
  });
});

describe("budgetTable", () => {
  const row = (id: string, hidden: boolean, available: number) => ({
    id, hidden, available, status: "none" as const, need: null, snoozed: false,
  });
  const groups = [
    { id: "g1", categories: [row("a", false, $(5)), row("b", false, 0)] },
    { id: "g2", categories: [row("c", false, 0)] },
  ];
  const hidden = [{ ...row("h", true, $(1)), groupId: "g1" }];

  it("leaves the groups as they are under All, with the Hidden section after them", () => {
    expect(budgetTable("all", groups, hidden, oct)).toEqual({ groups, hiddenSection: hidden, emptyMessage: null });
  });

  it("lists matching rows, hidden ones after the rest, and drops empty groups", () => {
    const table = budgetTable("available", groups, hidden, oct);
    expect(table.groups.map((g) => [g.id, g.categories.map((c) => c.id)])).toEqual([["g1", ["a", "h"]]]);
    expect(table.hiddenSection).toEqual([]);
    expect(table.emptyMessage).toBeNull();
  });

  it("says when nothing shows", () => {
    expect(budgetTable("snoozed", groups, hidden, oct).emptyMessage).toBe("No categories match this filter in October 2026.");
    expect(budgetTable("all", [], [], oct).emptyMessage).toMatch(/^No category groups yet/);
  });
});

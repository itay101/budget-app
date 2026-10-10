import { draftFrom, isRecurring, targetFields, type TargetDraft } from "./targetForm";
import { parseTargetInput, type Target } from "./targets";

// #171. Amounts in milliunits.
const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d));

function target(partial: Partial<Target> & Pick<Target, "kind">): Target {
  return { cadence: null, amount: 0, weekday: null, dueDay: null, dueDate: null, ...partial };
}

describe("draftFrom", () => {
  it("is a blank monthly Set aside without a target", () => {
    expect(draftFrom(null)).toMatchObject({ kind: "SET_ASIDE", cadence: "MONTHLY", amount: "" });
    expect(draftFrom(target({ kind: "NONE" }))).toMatchObject({ kind: "SET_ASIDE", amount: "" });
  });

  it("fills a monthly target's amount and due day", () => {
    const draft = draftFrom(target({ kind: "REFILL", cadence: "MONTHLY", amount: 400500, dueDay: 15 }));
    expect(draft).toMatchObject({ kind: "REFILL", cadence: "MONTHLY", amount: "400.5", dueDay: "15", dueDate: "", dueMonth: "" });
  });

  it("fills a weekly target's weekday", () => {
    expect(draftFrom(target({ kind: "SET_ASIDE", cadence: "WEEKLY", amount: 1000, weekday: 0 })).weekday).toBe("0");
  });

  it("fills a yearly target's due date", () => {
    const draft = draftFrom(target({ kind: "SET_ASIDE", cadence: "YEARLY", amount: 1000, dueDate: utc(2027, 3, 15) }));
    expect(draft).toMatchObject({ cadence: "YEARLY", dueDate: "2027-03-15", dueMonth: "" });
  });

  it("splits Have a balance into dated and undated", () => {
    expect(draftFrom(target({ kind: "BALANCE", amount: 1000, dueDate: utc(2027, 6) }))).toMatchObject({
      kind: "BALANCE_DATED",
      dueMonth: "2027-06",
      dueDate: "",
    });
    expect(draftFrom(target({ kind: "BALANCE", amount: 1000 })).kind).toBe("BALANCE");
  });
});

describe("targetFields", () => {
  const base: TargetDraft = { ...draftFrom(null), amount: "50", weekday: "3", dueDay: "9", dueDate: "2027-01-02", dueMonth: "2027-05" };

  it("sends only the field the cadence uses", () => {
    expect(targetFields({ ...base, cadence: "WEEKLY" })).toEqual({
      kind: "SET_ASIDE", amount: "50", cadence: "WEEKLY", weekday: "3", dueDay: undefined, dueDate: undefined,
    });
    expect(targetFields({ ...base, cadence: "MONTHLY" })).toMatchObject({ dueDay: "9", weekday: undefined });
    expect(targetFields({ ...base, kind: "REFILL", cadence: "YEARLY" })).toMatchObject({ kind: "REFILL", dueDate: "2027-01-02" });
  });

  it("sends a balance as BALANCE, dated or not", () => {
    expect(targetFields({ ...base, kind: "BALANCE_DATED" })).toEqual({ kind: "BALANCE", amount: "50", dated: "true", dueMonth: "2027-05" });
    expect(targetFields({ ...base, kind: "BALANCE" })).toEqual({ kind: "BALANCE", amount: "50", dated: "false", dueMonth: undefined });
  });

  it("round-trips through parseTargetInput back to the same target", () => {
    const targets = [
      target({ kind: "SET_ASIDE", cadence: "WEEKLY", amount: 25000, weekday: 6 }),
      target({ kind: "REFILL", cadence: "MONTHLY", amount: 600000, dueDay: 15 }),
      target({ kind: "SET_ASIDE", cadence: "YEARLY", amount: 1200000, dueDate: utc(2027, 3, 15) }),
      target({ kind: "BALANCE", amount: 3000000, dueDate: utc(2027, 6) }),
      target({ kind: "BALANCE", amount: 10000000 }),
    ];
    for (const t of targets) expect(parseTargetInput(targetFields(draftFrom(t)))).toEqual(t);
  });
});

describe("isRecurring", () => {
  it("is true for Set aside and Refill only", () => {
    expect(isRecurring({ ...draftFrom(null), kind: "REFILL" })).toBe(true);
    expect(isRecurring({ ...draftFrom(null), kind: "BALANCE_DATED" })).toBe(false);
  });
});

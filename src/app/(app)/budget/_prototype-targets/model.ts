// PROTOTYPE (issue #148), throwaway. Not production code: no tests, no
// persistence. Targets don't exist in the schema yet, so this file holds a
// rough in-memory version of ADR 0011's "Needed in month M" rules plus a
// fixture budget that hits every status. Delete with the rest of
// `_prototype-targets/` once a variant has won.

export type TargetKind = "SET_ASIDE" | "REFILL" | "BALANCE";
export type Cadence = "WEEKLY" | "MONTHLY" | "YEARLY" | null;

export type Target = {
  kind: TargetKind;
  cadence: Cadence;
  amount: number; // milliunits
  weekday?: number; // 0 = Sunday
  dueDay?: number; // monthly
  dueDate?: string; // yearly, "YYYY-MM-DD" of the next due date
  dueMonth?: string; // dated balance, "YYYY-MM"
  startMonth: string; // "YYYY-MM", the effective-from row
};

export type ProtoCategory = {
  id: string;
  name: string;
  groupName: string;
  hidden: boolean;
  isPayment?: boolean;
  assigned: number;
  activity: number;
  available: number;
  /** Available carried in from last month (available − assigned − activity). */
  carryIn: number;
  target: Target | null;
  /** The row before `target`, so the editor can say what earlier months keep. */
  previousTarget?: Target | null;
  snoozed: boolean;
  /** Which kind of spending made Available negative, if it is. */
  overspentOn?: "cash" | "credit";
};

export type Status =
  | "funded"
  | "overfunded"
  | "on_track"
  | "underfunded"
  | "overspent_cash"
  | "overspent_credit"
  | "snoozed"
  | "none";

export type Evaluation = {
  status: Status;
  /** Still to assign this month (ADR 0011's "Needed in month M"). */
  needed: number;
  /** This month's ask before assigned(M) is subtracted. */
  monthlyAsk: number;
  /** How much of the ask is covered this month. */
  fundedTowardAsk: number;
  /** 0..1 for the bar. */
  progress: number;
  /** For yearly and balance targets: the whole goal, not just this month. */
  overall?: { have: number; goal: number };
  dueLabel: string;
  summary: string;
};

export const STATUS_LABEL: Record<Status, string> = {
  funded: "Funded",
  overfunded: "Overfunded",
  on_track: "On track",
  underfunded: "Underfunded",
  overspent_cash: "Overspent",
  overspent_credit: "Overspent (credit)",
  snoozed: "Snoozed",
  none: "No target",
};

export const STATUS_ICON: Record<Status, string> = {
  funded: "check_circle",
  overfunded: "keyboard_double_arrow_up",
  on_track: "trending_up",
  underfunded: "error",
  overspent_cash: "warning",
  overspent_credit: "credit_card",
  snoozed: "snooze",
  none: "radio_button_unchecked",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_NAMES = WEEKDAYS;

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function previousMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 2, 1));
}

function monthsBetweenInclusive(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

function weekdayCount(monthK: string, weekday: number): number {
  const [y, m] = monthK.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= days; d++) if (new Date(y, m - 1, d).getDay() === weekday) n++;
  return n;
}

// "amounts split over months round up to the cent" (ADR 0011)
function ceilToCent(milliunits: number): number {
  return Math.ceil(milliunits / 10) * 10;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function describeTarget(t: Target | null | undefined, fmt: (n: number) => string): string {
  if (!t) return "No target";
  if (t.kind === "BALANCE") {
    return t.dueMonth
      ? `Have a balance of ${fmt(t.amount)} by ${monthLabel(t.dueMonth)}`
      : `Have a balance of ${fmt(t.amount)}`;
  }
  const verb = t.kind === "SET_ASIDE" ? "Set aside" : "Refill up to";
  if (t.cadence === "WEEKLY") return `${verb} ${fmt(t.amount)} every ${WEEKDAYS[t.weekday ?? 0]}`;
  if (t.cadence === "YEARLY") return `${verb} ${fmt(t.amount)} every year, due ${shortDate(t.dueDate)}`;
  return `${verb} ${fmt(t.amount)} each month${t.dueDay ? `, by the ${ordinal(t.dueDay)}` : ""}`;
}

function shortDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function evaluate(
  c: ProtoCategory,
  month: string,
  fmt: (n: number) => string,
): Evaluation {
  const t = c.target;
  const funded = Math.max(0, c.carryIn) + c.assigned;
  let monthlyAsk = 0;
  let needed = 0;
  let fundedTowardAsk = 0;
  let overall: Evaluation["overall"];
  let dueLabel = "";

  if (t) {
    if (t.kind === "BALANCE" && t.dueMonth) {
      const monthsLeft = Math.max(1, monthsBetweenInclusive(month, t.dueMonth));
      monthlyAsk = Math.max(0, ceilToCent((t.amount - c.carryIn) / monthsLeft));
      needed = monthlyAsk - c.assigned;
      fundedTowardAsk = c.assigned;
      overall = { have: funded, goal: t.amount };
      dueLabel = `by ${monthLabel(t.dueMonth)}`;
    } else if (t.kind === "BALANCE") {
      monthlyAsk = t.amount;
      needed = t.amount - funded;
      fundedTowardAsk = funded;
      dueLabel = "no date";
    } else if (t.cadence === "YEARLY") {
      const due = (t.dueDate ?? "").slice(0, 7);
      const monthsLeft = Math.max(1, monthsBetweenInclusive(month, due));
      const stillToFund = t.amount - Math.max(0, c.carryIn);
      monthlyAsk = Math.max(0, ceilToCent(stillToFund / monthsLeft));
      needed = monthlyAsk - c.assigned;
      fundedTowardAsk = c.assigned;
      overall = { have: funded, goal: t.amount };
      dueLabel = `due ${shortDate(t.dueDate)}`;
    } else {
      const amount =
        t.cadence === "WEEKLY" ? t.amount * weekdayCount(month, t.weekday ?? 0) : t.amount;
      monthlyAsk = amount;
      if (t.kind === "SET_ASIDE") {
        needed = amount - c.assigned;
        fundedTowardAsk = c.assigned;
      } else {
        needed = amount - funded;
        fundedTowardAsk = funded;
      }
      dueLabel =
        t.cadence === "WEEKLY"
          ? `every ${WEEKDAYS[t.weekday ?? 0]}`
          : t.dueDay
            ? `by the ${ordinal(t.dueDay)}`
            : "this month";
    }
  }
  needed = Math.max(0, needed);
  if (c.snoozed) needed = 0;

  let status: Status;
  if (c.available < 0) status = c.overspentOn === "credit" ? "overspent_credit" : "overspent_cash";
  else if (!t) status = "none";
  else if (c.snoozed) status = "snoozed";
  else if (needed > 0) status = "underfunded";
  // More assigned this month than the target asks for, or a balance target
  // already past its goal.
  else if (
    (monthlyAsk > 0 && fundedTowardAsk > monthlyAsk) ||
    (overall && overall.have > overall.goal)
  )
    status = "overfunded";
  else if (overall && overall.have < overall.goal) status = "on_track";
  else status = "funded";

  const progress = monthlyAsk > 0 ? Math.min(1, fundedTowardAsk / monthlyAsk) : t ? 1 : 0;

  let summary: string;
  switch (status) {
    case "overspent_cash":
      summary = `Overspent by ${fmt(-c.available)}, cover it from another category`;
      break;
    case "overspent_credit":
      summary = `${fmt(-c.available)} spent on credit with nothing set aside; it's now card debt`;
      break;
    case "none":
      summary = "No target";
      break;
    case "snoozed":
      summary = `Snoozed for ${monthLabel(month).split(" ")[0]}, wakes up next month`;
      break;
    case "underfunded":
      summary = `${fmt(needed)} more needed ${dueLabel}`;
      break;
    case "overfunded":
      summary = `Overfunded by ${fmt(
        overall && overall.have > overall.goal
          ? overall.have - overall.goal
          : fundedTowardAsk - monthlyAsk,
      )}`;
      break;
    case "on_track":
      summary = `On track: ${fmt(overall!.have)} of ${fmt(overall!.goal)} ${dueLabel}`;
      break;
    default:
      summary = "Funded";
  }

  return { status, needed, monthlyAsk, fundedTowardAsk, progress, overall, dueLabel, summary };
}

// ---------------------------------------------------------------------------
// Fixture: covers every status, a hidden underfunded category, a payment
// category, and Hebrew (RTL) names, including a long one.

const k = (n: number) => Math.round(n * 1000);

function cat(
  partial: Omit<ProtoCategory, "carryIn" | "available" | "snoozed" | "hidden"> & {
    carryIn?: number;
    snoozed?: boolean;
    hidden?: boolean;
  },
): ProtoCategory {
  const carryIn = partial.carryIn ?? 0;
  return {
    hidden: false,
    snoozed: false,
    ...partial,
    carryIn,
    available: carryIn + partial.assigned + partial.activity,
  };
}

export function fixtureCategories(month: string): ProtoCategory[] {
  const [y] = month.split("-").map(Number);
  const prev = previousMonthKey(month);
  return [
    cat({
      id: "rent", name: "Rent", groupName: "Bills",
      assigned: k(4500), activity: k(-4500),
      target: { kind: "SET_ASIDE", cadence: "MONTHLY", amount: k(4500), dueDay: 1, startMonth: "2026-01" },
    }),
    cat({
      id: "electric", name: "חשמל", groupName: "Bills",
      carryIn: k(150), assigned: k(100), activity: k(-80),
      target: { kind: "REFILL", cadence: "MONTHLY", amount: k(400), dueDay: 20, startMonth: month },
      previousTarget: { kind: "SET_ASIDE", cadence: "MONTHLY", amount: k(350), startMonth: "2026-02" },
    }),
    cat({
      id: "car-ins", name: "ביטוח רכב שנתי – מקיף וחובה", groupName: "Bills",
      carryIn: k(1800), assigned: k(300), activity: 0,
      target: { kind: "SET_ASIDE", cadence: "YEARLY", amount: k(3600), dueDate: `${y + 1}-03-01`, startMonth: "2026-03" },
    }),
    cat({
      id: "groceries", name: "מכולת", groupName: "Everyday",
      assigned: k(1800), activity: k(-1320),
      target: { kind: "SET_ASIDE", cadence: "WEEKLY", amount: k(500), weekday: 5, startMonth: "2026-01" },
    }),
    cat({
      id: "dining", name: "Dining out", groupName: "Everyday",
      assigned: k(600), activity: k(-750), overspentOn: "cash",
      target: { kind: "REFILL", cadence: "MONTHLY", amount: k(600), startMonth: "2026-01" },
    }),
    cat({
      id: "clothing", name: "Clothing", groupName: "Everyday",
      assigned: k(100), activity: k(-300), overspentOn: "credit",
      target: { kind: "SET_ASIDE", cadence: "MONTHLY", amount: k(300), startMonth: "2026-01" },
    }),
    cat({
      id: "coffee", name: "Coffee", groupName: "Everyday",
      assigned: k(150), activity: k(-60),
      target: { kind: "SET_ASIDE", cadence: "MONTHLY", amount: k(100), startMonth: "2026-01" },
    }),
    cat({
      id: "fuel", name: "Fuel", groupName: "Everyday",
      assigned: k(300), activity: k(-210), target: null,
    }),
    cat({
      id: "vacation", name: "חופשה ביוון", groupName: "Goals",
      carryIn: k(5000), assigned: 0, activity: 0,
      target: { kind: "BALANCE", cadence: null, amount: k(12000), dueMonth: `${y + 1}-06`, startMonth: "2026-04" },
    }),
    cat({
      id: "emergency", name: "Emergency fund", groupName: "Goals",
      carryIn: k(20000), assigned: 0, activity: 0,
      target: { kind: "BALANCE", cadence: null, amount: k(20000), startMonth: "2026-01" },
    }),
    cat({
      id: "gifts", name: "Gifts", groupName: "Goals",
      carryIn: k(40), assigned: 0, activity: 0, snoozed: true,
      target: { kind: "SET_ASIDE", cadence: "MONTHLY", amount: k(200), startMonth: prev },
    }),
    cat({
      id: "visa", name: "Visa", groupName: "Credit Card Payments", isPayment: true,
      carryIn: k(200), assigned: k(1000), activity: k(-1200),
      target: { kind: "SET_ASIDE", cadence: "MONTHLY", amount: k(1000), startMonth: "2026-05" },
    }),
    cat({
      id: "gym", name: "Old gym membership", groupName: "Everyday", hidden: true,
      assigned: 0, activity: 0,
      target: { kind: "SET_ASIDE", cadence: "MONTHLY", amount: k(150), startMonth: "2026-01" },
    }),
  ];
}

// Real budget rows with made-up targets (?data=real): the numbers are real,
// the targets are assigned by a hash of the category id so they stay stable
// across reloads.
export function fromRealRows(
  rows: { id: string; name: string; groupName: string; hidden: boolean; budgeted: number; activity: number; available: number }[],
  month: string,
): ProtoCategory[] {
  return rows.map((r) => {
    let h = 0;
    for (const ch of r.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const base = Math.max(k(100), Math.ceil(Math.max(r.budgeted, -r.activity, k(200)) / k(50)) * k(50));
    const pick = h % 6;
    const target: Target | null =
      pick === 0
        ? null
        : pick === 1
          ? { kind: "REFILL", cadence: "MONTHLY", amount: base, startMonth: month }
          : pick === 2
            ? { kind: "SET_ASIDE", cadence: "MONTHLY", amount: base, dueDay: 1 + (h % 28), startMonth: "2026-01" }
            : pick === 3
              ? { kind: "BALANCE", cadence: null, amount: base * 6, dueMonth: `${Number(month.slice(0, 4)) + 1}-0${1 + (h % 9)}`, startMonth: "2026-01" }
              : pick === 4
                ? { kind: "SET_ASIDE", cadence: "WEEKLY", amount: Math.ceil(base / 4 / k(10)) * k(10), weekday: h % 7, startMonth: "2026-01" }
                : { kind: "REFILL", cadence: "MONTHLY", amount: base * 2, startMonth: "2026-01" };
    return {
      id: r.id,
      name: r.name,
      groupName: r.groupName,
      hidden: r.hidden,
      assigned: r.budgeted,
      activity: r.activity,
      available: r.available,
      carryIn: r.available - r.budgeted - r.activity,
      target,
      snoozed: h % 11 === 0,
      overspentOn: "cash",
    };
  });
}

export type PlanTotals = {
  underfundedCount: number;
  underfundedTotal: number;
  underfundedHiddenCount: number;
  overspentToCover: number;
  overspentCount: number;
  snoozedCount: number;
  costToBeMe: number;
};

export function planTotals(cats: ProtoCategory[], month: string, fmt: (n: number) => string): PlanTotals {
  const t: PlanTotals = {
    underfundedCount: 0, underfundedTotal: 0, underfundedHiddenCount: 0,
    overspentToCover: 0, overspentCount: 0, snoozedCount: 0, costToBeMe: 0,
  };
  for (const c of cats) {
    const e = evaluate(c, month, fmt);
    if (e.needed > 0) {
      t.underfundedCount++;
      t.underfundedTotal += e.needed;
      if (c.hidden) t.underfundedHiddenCount++;
    }
    if (e.status === "overspent_cash") t.overspentToCover += -c.available;
    if (e.status === "overspent_cash" || e.status === "overspent_credit") t.overspentCount++;
    if (c.snoozed && c.target) t.snoozedCount++;
    if (c.target && !(c.target.kind === "BALANCE" && !c.target.dueMonth)) t.costToBeMe += e.monthlyAsk;
  }
  return t;
}

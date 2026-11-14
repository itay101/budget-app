import { addMonths, formatBudgetMonth } from "@/lib/budgetMonth";

/**
 * Per-category, per-month totals in milliunits: category id → Budget Month
 * (`YYYY-MM`) → amount. getBudgetMonthRows builds them from assignments
 * and a per-month activity query, and passes them in as plain `Map`s, so
 * the math here doesn't need to know Prisma's result shapes.
 */
export type MonthlyTotals = Map<string, Map<string, number>>;

/** One category's month-by-month amounts (Budget Month → milliunits). */
type ByMonth = Map<string, number>;

/**
 * Walks one category's months in order by ADR 0009's rollover rule,
 *
 *   Available(M) = max(0, Available(M-1)) + assigned(M) + activity(M),
 *
 * up to but not including `before`, and returns the Available carried in
 * to `before` plus each earlier month's cash overspending: how far that
 * month ended below 0, which comes out of the next month's Ready to
 * Assign. Only months with an assignment or activity are visited: a month
 * with neither just re-applies the max(0, ·), so it can't overspend.
 *
 * balanceFor (src/lib/budget.ts) and readyToAssignFor both use this one
 * fold, so a category's Available and the overspending Ready to Assign
 * absorbs can't drift apart.
 */
export function rollForward(
  assigned: ByMonth | undefined,
  activity: ByMonth | undefined,
  before: string,
): { carriedIn: number; overspentByMonth: ByMonth } {
  // YYYY-MM keys sort chronologically as strings.
  const months = [...new Set([...(assigned?.keys() ?? []), ...(activity?.keys() ?? [])])]
    .filter((key) => key < before)
    .sort();

  let available = 0;
  const overspentByMonth: ByMonth = new Map();
  for (const key of months) {
    available = Math.max(0, available) + (assigned?.get(key) ?? 0) + (activity?.get(key) ?? 0);
    if (available < 0) overspentByMonth.set(key, -available);
  }
  return { carriedIn: Math.max(0, available), overspentByMonth };
}

export type ReadyToAssignState = "positive" | "zero" | "negative";

/**
 * A Budget Month's Ready to Assign and the Breakdown lines that add up to
 * it (#136), all in milliunits. Every line is a positive amount except
 * `leftOver`, which can be negative; the sign shown is the line's role:
 *
 *   total = leftOver + inflow − overspent − assigned − assignedFuture
 */
export interface ReadyToAssignBreakdown {
  /** Last month's Ready to Assign before this month's and later months'
   * assignments come out. Negative when last month was over-assigned. */
  leftOver: number;
  /** Inflow: Ready to Assign income dated this month. */
  inflow: number;
  /** Cash overspending at the end of last month, across every category,
   * hidden ones and Uncategorized included. */
  overspent: number;
  /** Assigned this month, across every category. */
  assigned: number;
  /** Assigned in any later month. Only for the current month and later
   * (ADR 0009): an earlier month shows its own figure, so this is 0. */
  assignedFuture: number;
  total: number;
  state: ReadyToAssignState;
}

export interface ReadyToAssignInput {
  /** The viewed Budget Month (a UTC first-of-month). */
  month: Date;
  /** The current Budget Month: from here on, later assignments count. */
  current: Date;
  /** On-budget Inflow: Ready to Assign income by month, through `month`. */
  incomeByMonth: ByMonth;
  /** Every ordinary category's assignments by month, through `month`. */
  assignedByMonth: MonthlyTotals;
  /** Everything assigned in months after `month`, across every category. */
  assignedAfter: number;
  /** Activity by month through `month`, per ordinary category plus one entry
   * for on-budget Uncategorized transactions, which can overspend too. */
  activityByMonth: MonthlyTotals;
}

function sumWhere(byMonth: ByMonth | undefined, keep: (key: string) => boolean): number {
  let total = 0;
  for (const [key, amount] of byMonth ?? []) if (keep(key)) total += amount;
  return total;
}

/**
 * ADR 0009's Ready to Assign for a Budget Month, with its Breakdown:
 *
 *   own(M)   = income through M − overspending in every month before M
 *              − everything assigned through M
 *   RTA(M)   = own(M) − (M ≥ current ? everything assigned after M : 0)
 *
 * so the Breakdown's `leftOver` is own(M−1), and the lines add up exactly
 * to the total. A negative figure carries forward as-is, so later income
 * covers it first.
 */
export function readyToAssignFor({
  month,
  current,
  incomeByMonth,
  assignedByMonth,
  assignedAfter,
  activityByMonth,
}: ReadyToAssignInput): ReadyToAssignBreakdown {
  const key = formatBudgetMonth(month);
  const lastKey = formatBudgetMonth(addMonths(month, -1));

  let overspentBefore = 0;
  let overspent = 0;
  for (const id of new Set([...assignedByMonth.keys(), ...activityByMonth.keys()])) {
    const { overspentByMonth } = rollForward(assignedByMonth.get(id), activityByMonth.get(id), key);
    overspentBefore += sumWhere(overspentByMonth, () => true);
    overspent += overspentByMonth.get(lastKey) ?? 0;
  }

  let assignedBefore = 0;
  let assigned = 0;
  for (const byMonth of assignedByMonth.values()) {
    assignedBefore += sumWhere(byMonth, (k) => k < key);
    assigned += byMonth.get(key) ?? 0;
  }

  const inflow = incomeByMonth.get(key) ?? 0;
  const incomeBefore = sumWhere(incomeByMonth, (k) => k < key);
  // own(M−1): overspending at the end of M−1 only comes out in M.
  const leftOver = incomeBefore - (overspentBefore - overspent) - assignedBefore;
  const assignedFuture = month.getTime() >= current.getTime() ? assignedAfter : 0;
  const total = leftOver + inflow - overspent - assigned - assignedFuture;

  return {
    leftOver,
    inflow,
    overspent,
    assigned,
    assignedFuture,
    total,
    state: total > 0 ? "positive" : total < 0 ? "negative" : "zero",
  };
}

/**
 * Stands in for Ready to Assign as either side of a Move Money
 * (`transferAvailable`'s fromCategoryId/toCategoryId, #134). It's not a
 * category id, and it can never be one: ids are cuids.
 */
export const READY_TO_ASSIGN = "READY_TO_ASSIGN";

/** One category's change to its viewed month's `budgeted`, in milliunits. */
export interface MoveLeg {
  categoryId: string;
  delta: number;
}

/**
 * The `budgeted` changes a Move Money of `amount` makes. Ready to Assign
 * is derived, so a move to or from it changes only the other category:
 * moving from Ready to Assign assigns money (+amount), and moving to it
 * un-assigns money (−amount), even below 0. Throws for a move with the
 * same thing on both sides, Ready to Assign included.
 */
export function moveLegs(fromId: string, toId: string, amount: number): MoveLeg[] {
  if (fromId === toId) {
    throw new Error(
      fromId === READY_TO_ASSIGN
        ? "Cannot move money from Ready to Assign to Ready to Assign"
        : "Cannot move money to the same category",
    );
  }
  const legs: MoveLeg[] = [];
  if (fromId !== READY_TO_ASSIGN) legs.push({ categoryId: fromId, delta: -amount });
  if (toId !== READY_TO_ASSIGN) legs.push({ categoryId: toId, delta: amount });
  return legs;
}

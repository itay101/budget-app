/**
 * Category Targets (ADR 0011): which target applies in a Budget Month, how
 * much it still needs, and the status the budget page shows. Pure and
 * Prisma-free so the rules are unit tested directly; getBudgetMonthRows
 * feeds it the stored rows and each category's carry-in and assignment.
 *
 * Amounts are milliunits (src/lib/money.ts). Months are Budget Months, the
 * UTC first of the month (src/lib/budgetMonth.ts).
 */

import { ceilDiv } from "@/lib/money";

export type TargetKind = "SET_ASIDE" | "REFILL" | "BALANCE" | "NONE";
export type TargetCadence = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Target {
  kind: TargetKind;
  /** Null for BALANCE and NONE. */
  cadence: TargetCadence | null;
  amount: number;
  /** WEEKLY: 0 = Sunday ... 6 = Saturday. */
  weekday: number | null;
  /** MONTHLY, optional. Only orders Auto-Assign and shows on screen. */
  dueDay: number | null;
  /** YEARLY: the due date, repeating yearly. Dated BALANCE: the due month. */
  dueDate: Date | null;
}

export interface TargetRow extends Target {
  startMonth: Date;
}

/** Whether a row has the fields its kind and cadence need: a cadence for
 * Set aside and Refill, a weekday for weekly, a due date for yearly. The
 * actions (#170) only store complete rows; this keeps an incomplete one
 * from being read with a made-up default. */
function isComplete(target: Target): boolean {
  if (target.kind === "NONE" || target.kind === "BALANCE") return true;
  if (target.cadence === "WEEKLY") return target.weekday !== null;
  if (target.cadence === "YEARLY") return target.dueDate !== null;
  return target.cadence === "MONTHLY";
}

/** The latest row starting on or before `month`, or null when there is
 * none, that row is a NONE (the target was removed from then on), or it's
 * incomplete. */
export function effectiveTarget(rows: TargetRow[], month: Date): Target | null {
  let latest: TargetRow | null = null;
  for (const row of rows) {
    if (row.startMonth.getTime() > month.getTime()) continue;
    if (!latest || row.startMonth.getTime() > latest.startMonth.getTime()) latest = row;
  }
  return latest && latest.kind !== "NONE" && isComplete(latest) ? latest : null;
}

export interface TargetFunding {
  /** Available carried in from last month: max(0, Available(M-1)). */
  carriedIn: number;
  /** Assigned in this month. */
  assigned: number;
  snoozed?: boolean;
  /** The category's assigned amount per Budget Month (`YYYY-MM`). Only a
   * yearly Set aside reads it, to count what was set aside this cycle. */
  assignedByMonth?: Map<string, number>;
}

export interface TargetNeed {
  /** This month's ask: the rule before assigned(M) is taken off. Cost to
   * Be Me sums these. */
  ask: number;
  /** Still to assign this month, ADR 0011's "Needed in month M". */
  needed: number;
  /** For yearly and balance targets: progress toward the whole amount. */
  goal?: { have: number; amount: number };
}

const CENT = 10; // milliunits

/** `milliunits` split over `months`, rounded up to the cent (ADR 0011).
 * Rounding the share up to the milliunit and then to the cent is the same
 * as one ceiling over cents, so a single integer division does both. */
function splitToCent(milliunits: number, months: number): number {
  return ceilDiv(milliunits, months * CENT) * CENT;
}

function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** Months from `month` to `due`, counting both ends; at least 1, so a
 * passed due month asks for the whole remainder. */
function monthsLeft(month: Date, due: Date): number {
  return Math.max(1, monthIndex(due) - monthIndex(month) + 1);
}

function weekdaysInMonth(month: Date, weekday: number): number {
  const year = month.getUTCFullYear();
  const m = month.getUTCMonth();
  const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, m, 1)).getUTCDay();
  const firstMatch = 1 + ((weekday - firstWeekday + 7) % 7);
  return Math.floor((days - firstMatch) / 7) + 1;
}

/** The yearly due date's next occurrence in or after `month`: a new cycle
 * starts the month after it (ADR 0011). */
function nextYearlyDue(dueDate: Date, month: Date): Date {
  const due = new Date(Date.UTC(month.getUTCFullYear(), dueDate.getUTCMonth(), 1));
  return monthIndex(due) < monthIndex(month)
    ? new Date(Date.UTC(month.getUTCFullYear() + 1, dueDate.getUTCMonth(), 1))
    : due;
}

/** Have a balance of: a dated balance spreads what's missing over the
 * months left to its due month; an undated one asks for all of it. */
function balanceAsk(target: Target, remaining: number, month: Date): number {
  return target.dueDate ? splitToCent(remaining, monthsLeft(month, target.dueDate)) : remaining;
}

/** Yearly: what's still to fund this cycle, spread over the months left. */
function yearlyAsk(dueDate: Date, remaining: number, month: Date): number {
  return splitToCent(remaining, monthsLeft(month, nextYearlyDue(dueDate, month)));
}

function monthKey(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** A yearly Set aside's progress: what was assigned this cycle before
 * `month`. The cycle runs from the month after the previous due month
 * through the next due month, so last cycle's money and this cycle's
 * spending don't count (ADR 0011 amendment). */
function setAsideThisCycle(dueDate: Date, month: Date, byMonth: Map<string, number> | undefined): number {
  const cycleStart = monthIndex(nextYearlyDue(dueDate, month)) - 11;
  let total = 0;
  for (let i = cycleStart; i < monthIndex(month); i++) total += byMonth?.get(monthKey(i)) ?? 0;
  return total;
}

/** What a yearly target has toward its amount before this month's
 * assignment: Refill counts the balance; Set aside counts this cycle's
 * assignments. */
function yearlyProgress(target: Target & { dueDate: Date }, funding: TargetFunding, month: Date): number {
  return target.kind === "SET_ASIDE"
    ? setAsideThisCycle(target.dueDate, month, funding.assignedByMonth)
    : funding.carriedIn;
}

/** Monthly or weekly: the month's amount; a refill counts what was
 * carried in toward it. */
function recurringAsk(target: Target, carriedIn: number, month: Date): number {
  const amount =
    target.cadence === "WEEKLY" ? target.amount * weekdaysInMonth(month, target.weekday ?? 0) : target.amount;
  return target.kind === "REFILL" ? Math.max(0, amount - carriedIn) : amount;
}

function isYearly(target: Target): target is Target & { dueDate: Date } {
  return target.cadence === "YEARLY" && target.dueDate !== null && target.kind !== "BALANCE";
}

/** This month's ask for a target, by ADR 0011's table, floored at 0. */
function askFor(target: Target, funding: TargetFunding, month: Date): number {
  if (target.kind === "NONE") return 0;
  if (target.kind === "BALANCE") return balanceAsk(target, Math.max(0, target.amount - funding.carriedIn), month);
  if (isYearly(target)) {
    const remaining = Math.max(0, target.amount - yearlyProgress(target, funding, month));
    return yearlyAsk(target.dueDate, remaining, month);
  }
  return recurringAsk(target, funding.carriedIn, month);
}

/** What a target asks for and still needs in `month`. A snoozed target
 * needs nothing, but keeps its ask for Cost to Be Me. */
export function needFor(target: Target, funding: TargetFunding, month: Date): TargetNeed {
  const ask = askFor(target, funding, month);
  const needed = funding.snoozed ? 0 : Math.max(0, ask - funding.assigned);
  return { ask, needed, ...goalFor(target, funding, month) };
}

/** Yearly and balance targets also report progress toward the whole
 * amount: the balance, or for a yearly Set aside this cycle's assignments,
 * plus this month's. */
function goalFor(target: Target, funding: TargetFunding, month: Date): Pick<TargetNeed, "goal"> {
  if (isYearly(target)) {
    return { goal: { have: yearlyProgress(target, funding, month) + funding.assigned, amount: target.amount } };
  }
  if (target.kind === "BALANCE") {
    return { goal: { have: funding.carriedIn + funding.assigned, amount: target.amount } };
  }
  return {};
}

export type TargetStatus =
  | "funded"
  | "overfunded"
  | "on_track"
  | "underfunded"
  | "overspent"
  | "snoozed"
  | "none";

/** The status shown on a category row (#148). Overspending wins over any
 * target state; credit overspending gets its own status once Payment
 * Categories exist (ADR 0010). */
export function targetStatus(
  target: Target | null,
  need: TargetNeed | null,
  funding: TargetFunding & { available: number },
): TargetStatus {
  if (funding.available < 0) return "overspent";
  if (!target || !need) return "none";
  if (funding.snoozed) return "snoozed";
  if (need.needed > 0) return "underfunded";
  if (funding.assigned > need.ask || (need.goal && need.goal.have > need.goal.amount)) return "overfunded";
  if (need.goal && need.goal.have < need.goal.amount) return "on_track";
  return "funded";
}

export interface PlanTotals {
  /** What targets still need this month, hidden categories included. */
  needed: number;
  /** Cash overspending to cover this month. */
  overspending: number;
  /** Plan-level Underfunded (ADR 0011): needed plus overspending. */
  underfunded: number;
  /** Sum of monthly asks; undated balances left out, snoozed kept. */
  costToBeMe: number;
}

export function planTotals(
  rows: { target: Target | null; need: TargetNeed | null; available: number }[],
): PlanTotals {
  const totals = { needed: 0, overspending: 0, costToBeMe: 0 };
  for (const row of rows) {
    if (row.available < 0) totals.overspending -= row.available;
    if (!row.target || !row.need) continue;
    totals.needed += row.need.needed;
    const undatedBalance = row.target.kind === "BALANCE" && !row.target.dueDate;
    if (!undatedBalance) totals.costToBeMe += row.need.ask;
  }
  return { ...totals, underfunded: totals.needed + totals.overspending };
}

export type QuickFilter = "all" | "snoozed" | "underfunded" | "overfunded" | "available";

/** The budget page's quick filters (#148). All is the normal budget with
 * hidden categories left out; every other filter includes hidden ones.
 * Snoozed reads the snooze itself, since an overspent row's status is
 * "overspent" whether or not it's snoozed. */
export function matchesQuickFilter(
  filter: QuickFilter,
  row: { hidden: boolean; available: number; status: TargetStatus; needed: number; snoozed: boolean },
): boolean {
  switch (filter) {
    case "all":
      return !row.hidden;
    case "snoozed":
      return row.snoozed;
    case "underfunded":
      return row.needed > 0;
    case "overfunded":
      return row.status === "overfunded";
    case "available":
      return row.available > 0;
  }
}

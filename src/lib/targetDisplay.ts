/**
 * How the budget page shows Category Targets (#171, variant C of #148):
 * the target described in words, its due label, the progress bar and its
 * caption, an overspent bar's excess, and the quick filters' counts. Pure
 * and Prisma-free like src/lib/targets.ts, whose rules it reads.
 *
 * Amounts are milliunits; `fmt` turns one into display text, so this
 * module doesn't pick a currency.
 */

import { addMonths, monthLabel, parseBudgetMonth } from "@/lib/budgetMonth";
import {
  matchesQuickFilter,
  recurringAmount,
  type QuickFilter,
  type Target,
  type TargetNeed,
  type TargetStatus,
} from "@/lib/targets";

type Fmt = (milliunits: number) => string;

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

function daysInMonth(month: Date): number {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
}

/** "Mar 15, 2027". */
function shortDate(date: Date): string {
  return date.toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Mar 15", for a yearly due date that repeats. */
function dayAndMonth(date: Date): string {
  return date.toLocaleString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** A yearly target's next due date in or after `month`, its day clamped
 * to that month's last day (29 Feb in a non-leap year is the 28th). */
function nextYearlyDueDate(dueDate: Date, month: Date): Date {
  const year =
    dueDate.getUTCMonth() < month.getUTCMonth() ? month.getUTCFullYear() + 1 : month.getUTCFullYear();
  const dueMonth = new Date(Date.UTC(year, dueDate.getUTCMonth(), 1));
  return new Date(Date.UTC(year, dueDate.getUTCMonth(), Math.min(dueDate.getUTCDate(), daysInMonth(dueMonth))));
}

/** The target in words, for the editor's history and its "earlier months
 * keep" note: "Set aside $400 each month, by the 15th". */
export function describeTarget(target: Target | null, fmt: Fmt): string {
  if (!target || target.kind === "NONE") return "No target";
  if (target.kind === "BALANCE") {
    return target.dueDate
      ? `Have a balance of ${fmt(target.amount)} by ${monthLabel(target.dueDate)}`
      : `Have a balance of ${fmt(target.amount)}`;
  }
  const verb = target.kind === "SET_ASIDE" ? "Set aside" : "Refill up to";
  switch (target.cadence) {
    case "WEEKLY":
      return `${verb} ${fmt(target.amount)} every ${WEEKDAY_NAMES[target.weekday ?? 0]}`;
    case "YEARLY":
      return `${verb} ${fmt(target.amount)} every year, due ${target.dueDate ? dayAndMonth(target.dueDate) : "yearly"}`;
    default:
      return `${verb} ${fmt(target.amount)} each month${target.dueDay ? `, by the ${ordinal(target.dueDay)}` : ""}`;
  }
}

/** When the target is due, as the bar's caption shows it in `month`. A
 * monthly due day is clamped to the month's last day. */
export function dueLabel(target: Target, month: Date): string {
  if (target.kind === "BALANCE") {
    return target.dueDate ? `by ${monthLabel(target.dueDate, "short")}` : "no date";
  }
  switch (target.cadence) {
    case "WEEKLY":
      return `every ${WEEKDAY_NAMES[target.weekday ?? 0]}`;
    case "YEARLY":
      return target.dueDate ? `due ${shortDate(nextYearlyDueDate(target.dueDate, month))}` : "";
    default:
      return target.dueDay ? `by the ${ordinal(Math.min(target.dueDay, daysInMonth(month)))}` : "this month";
  }
}

/** The numbers a row's target cell reads. */
export interface TargetRowNumbers {
  target: Target | null;
  need: TargetNeed | null;
  carriedIn: number;
  /** Assigned this month. */
  budgeted: number;
  available: number;
}

export interface TargetProgress {
  have: number;
  of: number;
  /** 0..1, for the bar's fill. */
  fraction: number;
}

/**
 * This month's progress, for the bar and its "$250 of $400" caption:
 * - monthly or weekly Set aside: assigned of the month's amount
 * - monthly or weekly Refill, and an undated balance: carry-in plus
 *   assigned of the amount
 * - yearly and dated balance: assigned of this month's ask, or the whole
 *   target's progress once this month asks for nothing
 */
export function targetProgress(row: TargetRowNumbers, month: Date): TargetProgress | null {
  const { target, need } = row;
  if (!target || !need || target.kind === "NONE") return null;
  const funded = row.carriedIn + row.budgeted;

  let have: number;
  let of: number;
  if (target.kind === "BALANCE" && !target.dueDate) {
    [have, of] = [funded, target.amount];
  } else if (target.kind === "BALANCE" || target.cadence === "YEARLY") {
    [have, of] = need.ask > 0 || !need.goal ? [row.budgeted, need.ask] : [need.goal.have, need.goal.amount];
  } else {
    [have, of] = [target.kind === "REFILL" ? funded : row.budgeted, recurringAmount(target, month)];
  }
  return { have, of, fraction: of > 0 ? Math.min(1, Math.max(0, have / of)) : 1 };
}

export interface OverspendBar {
  /** Where the 100% tick sits, as a percentage of the bar. */
  coveredPct: number;
  /** "+$150 · 125%", or just "+$150" when nothing covered it. */
  excessLabel: string;
}

/**
 * An overspent row's bar (#148): scaled to what was spent, with 100% at
 * what covered it (carry-in plus assigned) and the excess past it.
 * Null unless Available is below 0.
 */
export function overspendBar(row: Pick<TargetRowNumbers, "carriedIn" | "budgeted" | "available">, fmt: Fmt): OverspendBar | null {
  if (row.available >= 0) return null;
  const covered = Math.max(0, row.carriedIn + row.budgeted);
  const spent = covered - row.available;
  const pct = covered > 0 ? ` · ${Math.round((spent * 100) / covered)}%` : "";
  return { coveredPct: (covered * 100) / spent, excessLabel: `+${fmt(-row.available)}${pct}` };
}

/** What the quick filters and the banner read off each row. */
export interface FilterableRow {
  hidden: boolean;
  available: number;
  status: TargetStatus;
  need: TargetNeed | null;
  snoozed: boolean;
}

export const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "snoozed", label: "Snoozed" },
  { key: "underfunded", label: "Underfunded" },
  { key: "overfunded", label: "Overfunded" },
  { key: "available", label: "Money Available" },
];

/** `?filter=` → a quick filter; anything else is All. */
export function parseQuickFilter(input: string | string[] | undefined): QuickFilter {
  return QUICK_FILTERS.find((f) => f.key === input)?.key ?? "all";
}

function matches(filter: QuickFilter, row: FilterableRow): boolean {
  return matchesQuickFilter(filter, { ...row, needed: row.need?.needed ?? 0 });
}

/** The rows a quick filter shows, in order. */
export function filterRows<R extends FilterableRow>(filter: QuickFilter, rows: R[]): R[] {
  return rows.filter((row) => matches(filter, row));
}

/** Each quick filter's count: how many rows it shows. */
export function quickFilterCounts(rows: FilterableRow[]): Record<QuickFilter, number> {
  const counts = { all: 0, snoozed: 0, underfunded: 0, overfunded: 0, available: 0 };
  for (const row of rows) {
    for (const { key } of QUICK_FILTERS) if (matches(key, row)) counts[key]++;
  }
  return counts;
}

export interface UnderfundedBanner {
  /** Categories still needing money this month, hidden ones included. */
  count: number;
  /** How many of those are hidden. */
  hidden: number;
  /** Snoozed categories with a target, left out of the total. */
  snoozed: number;
}

/** The counts the Underfunded banner shows beside the plan totals. */
export function underfundedBanner(rows: FilterableRow[]): UnderfundedBanner {
  const banner = { count: 0, hidden: 0, snoozed: 0 };
  for (const row of rows) {
    if (row.snoozed && row.need) banner.snoozed++;
    if ((row.need?.needed ?? 0) <= 0) continue;
    banner.count++;
    if (row.hidden) banner.hidden++;
  }
  return banner;
}

/** What a set of rows still needs this month: a group header's "$X needed". */
export function totalNeeded(rows: Pick<FilterableRow, "need">[]): number {
  return rows.reduce((sum, row) => sum + (row.need?.needed ?? 0), 0);
}

/** One stored target row, as the editor's history shows it (#171). */
export interface TargetHistoryEntry {
  /** The Budget Month the row applies from, `YYYY-MM`. */
  startMonth: string;
  /** Null for a NONE row: the target was removed from then on. */
  target: Target | null;
}

/** The target in effect in a month (`YYYY-MM`) by the history, newest
 * first: what "<month> and earlier keep" refers to. */
export function targetAsOf(history: TargetHistoryEntry[], monthKey: string): Target | null {
  return history.find((entry) => entry.startMonth <= monthKey)?.target ?? null;
}

function labelOf(monthKey: string): string {
  const month = parseBudgetMonth(monthKey);
  return month ? monthLabel(month) : monthKey;
}

/** Each history row with the months it covered: "June 2026 – September
 * 2026", or "October 2026 onwards" for the newest. */
export function historyRanges(history: TargetHistoryEntry[]): (TargetHistoryEntry & { range: string })[] {
  return history.map((entry, i) => {
    const next = i > 0 ? parseBudgetMonth(history[i - 1].startMonth) : null;
    const range = next
      ? `${labelOf(entry.startMonth)} – ${monthLabel(addMonths(next, -1))}`
      : `${labelOf(entry.startMonth)} onwards`;
    return { ...entry, range };
  });
}

/**
 * What the budget table shows under a quick filter (#171). All is the
 * groups as they are, with hidden categories in their own section after
 * them. Every other filter lists each group's matching categories, its
 * hidden ones included after the rest, drops groups with no match, and
 * has no Hidden section. `emptyMessage` is set when nothing shows.
 */
export function budgetTable<G extends { id: string; categories: FilterableRow[] }, H extends G["categories"][number] & { groupId: string }>(
  filter: QuickFilter,
  groups: G[],
  hidden: H[],
  month: Date,
): { groups: G[]; hiddenSection: H[]; emptyMessage: string | null } {
  if (filter === "all") {
    return {
      groups,
      hiddenSection: hidden,
      emptyMessage: groups.length === 0 ? "No category groups yet. Use the \u201cAdd\u201d button above to get started." : null,
    };
  }
  const shown = groups
    .map((group) => ({
      ...group,
      categories: filterRows(filter, [...group.categories, ...hidden.filter((row) => row.groupId === group.id)]),
    }))
    .filter((group) => group.categories.length > 0);
  return {
    groups: shown,
    hiddenSection: [],
    emptyMessage: shown.length === 0 ? `No categories match this filter in ${monthLabel(month)}.` : null,
  };
}

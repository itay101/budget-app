/**
 * Budget Month helpers (#124). A Budget Month is a calendar month in UTC,
 * represented as a `Date` at 00:00 UTC on the 1st — the same instant
 * `CategoryMonth.month` stores — and as a `YYYY-MM` string in URLs
 * (`/budget?month=2026-10`) and in the forms that act on the viewed month.
 *
 * Everything here is UTC on purpose: transaction dates are stored at UTC
 * midnight, and the server's local time zone must never shift a month.
 */

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `YYYY-MM` → the UTC first of that month, or null if malformed. */
export function parseBudgetMonth(input: string): Date | null {
  const match = MONTH_PATTERN.exec(input);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

/** A date's UTC month as `YYYY-MM`. */
export function formatBudgetMonth(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

function startOfUTCMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** The Budget Month containing `now`, by UTC (#124). */
export function currentBudgetMonth(now: Date = new Date()): Date {
  return startOfUTCMonth(now);
}

export function addMonths(month: Date, count: number): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + count, 1));
}

export type BudgetMonthRange = { first: Date; last: Date };

export type BudgetMonthBounds = {
  budgetCreatedAt: Date;
  earliestTransaction?: Date | null;
  earliestAssignment?: Date | null;
  /** The latest month with a non-zero assigned amount. */
  latestAssignment?: Date | null;
};

/** How far back and forward a budget can be navigated (#124): back to the
 * earliest of creation, first transaction and first assignment; forward to
 * the current month + 12, or further if money is already assigned later.
 * The current month is always in range. */
export function navigableRange(bounds: BudgetMonthBounds, current: Date): BudgetMonthRange {
  const starts = [bounds.budgetCreatedAt, bounds.earliestTransaction, bounds.earliestAssignment, current]
    .filter((d): d is Date => d instanceof Date)
    .map((d) => startOfUTCMonth(d).getTime());
  const ends = [addMonths(current, 12), bounds.latestAssignment]
    .filter((d): d is Date => d instanceof Date)
    .map((d) => startOfUTCMonth(d).getTime());
  return { first: new Date(Math.min(...starts)), last: new Date(Math.max(...ends)) };
}

export function isInRange(month: Date, range: BudgetMonthRange): boolean {
  return month.getTime() >= range.first.getTime() && month.getTime() <= range.last.getTime();
}

export function clampMonth(month: Date, range: BudgetMonthRange): Date {
  if (month.getTime() < range.first.getTime()) return range.first;
  if (month.getTime() > range.last.getTime()) return range.last;
  return month;
}

/** "October 2026", or "Oct 2026" with `"short"`. */
export function monthLabel(month: Date, style: "long" | "short" = "long"): string {
  return month.toLocaleString("en-US", { month: style, year: "numeric", timeZone: "UTC" });
}

/** The month's first and last day as `YYYY-MM-DD`, for the transactions
 * list's `from`/`to` filter params. */
export function monthDateRange(month: Date): { from: string; to: string } {
  const last = new Date(addMonths(month, 1).getTime() - 24 * 60 * 60 * 1000);
  return { from: month.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/**
 * Which month `/budget?month=…` shows (#124): a missing or malformed value
 * falls back to the current month; an in-range month is shown as is; an
 * out-of-range one redirects to the nearest month in range, so the URL
 * always matches what's on screen.
 */
export function resolveViewedMonth(
  requested: string | string[] | undefined,
  range: BudgetMonthRange,
  current: Date,
): { month: Date } | { redirectTo: Date } {
  const month = (typeof requested === "string" ? parseBudgetMonth(requested) : null) ?? current;
  return isInRange(month, range) ? { month } : { redirectTo: clampMonth(month, range) };
}

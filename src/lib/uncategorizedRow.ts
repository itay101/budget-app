/**
 * The pinned Uncategorized row on the budget page (#182, #225).
 *
 * Activity and Available come from the on-budget Ready to Assign totals.
 * `count` is how many rows the viewed month's uncategorized transactions
 * list shows (`/accounts/all?category=__uncategorized__`), which is what
 * "N need a category" has to match.
 */

/**
 * Shown when this month has transactions that still need a category, or
 * when Available isn't zero. Transactions that net to $0 still count: they
 * need a category. A positive Available carries over, so the row stays up
 * with no new transactions. Cash overspending is non-zero until the month
 * rolls (ADR 0009).
 */
export function showUncategorizedRow(count: number, available: number): boolean {
  return count > 0 || available !== 0;
}

/**
 * The line under the row name. The spec's phrase is "N need a category";
 * a single transaction reads "needs" so the line is grammatical.
 */
export function uncategorizedNudge(count: number): string {
  return count === 1 ? "1 needs a category" : `${count} need a category`;
}

/**
 * Colour of the Available amount. Cash overspending is red, matching every
 * other category. A positive Available is grey: that money can't be spent
 * until the inflow is categorized (#182). Zero keeps the usual green.
 * Credit overspending's amber pill waits for #224; until then a negative
 * Available is always the red cash colour.
 */
export function uncategorizedAvailableClass(available: number): string {
  if (available < 0) return "text-danger";
  if (available > 0) return "text-neutral-600";
  return "text-success";
}

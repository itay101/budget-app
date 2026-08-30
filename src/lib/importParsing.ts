/**
 * Cell-level parsing helpers for File Import (#35). Kept separate from the
 * CSV tokenizer (@/lib/csv) and the column-mapping UI (ImportTransactionsModal)
 * since bank exports vary in date/amount formatting far more than in CSV
 * quoting - these are the two spots most likely to need another format
 * added later.
 */

export type DateOrder = "MDY" | "DMY";

// Matches a two-component-plus-year date with any of the separators real
// exports actually use ("21/8/2026", "21-8-2026", "21.8.2026") - banks
// aren't consistent about this, and unlike the day/month order itself, the
// separator character carries no information worth preserving, so one
// regex handles all three rather than needing a separate format per
// separator.
const DELIMITED_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/;

/**
 * Parses a date cell into an ISO "yyyy-mm-dd" string, or null if the cell
 * doesn't match a format File Import understands. Supports ISO
 * ("2026-08-21", optionally with a time component) and delimited dates
 * ("8/21/2026", "21-8-2026", "21.8.2026") - `order` says which side of a
 * delimited date is the month vs the day, since that's not decidable from
 * a single cell (see detectDateOrder, which infers it from a whole column
 * of cells and is what File Import actually drives this from). Defaults to
 * MDY (US) for a bare call with no column context to infer from.
 */
export function parseImportDate(
  raw: string,
  order: DateOrder = "MDY",
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, year, month, day] = iso;
    return isValidDate(year, month, day) ? `${year}-${month}-${day}` : null;
  }

  const delimited = trimmed.match(DELIMITED_DATE);
  if (delimited) {
    const [, a, b, yRaw] = delimited;
    const year = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const [monthRaw, dayRaw] = order === "DMY" ? [b, a] : [a, b];
    const month = monthRaw.padStart(2, "0");
    const day = dayRaw.padStart(2, "0");
    return isValidDate(year, month, day) ? `${year}-${month}-${day}` : null;
  }

  return null;
}

/**
 * Infers whether a column of delimited dates (see DELIMITED_DATE) is
 * month-first (MDY, the US convention parseImportDate defaulted to
 * exclusively before this) or day-first (DMY, what most non-US bank
 * exports use) by looking for a value only one order could produce: a
 * first or second component over 12, which can't be a month. A column
 * where every date's day and month both happen to be <=12 is genuinely
 * ambiguous from the data alone and falls back to MDY, matching File
 * Import's original assumption.
 */
export function detectDateOrder(values: string[]): DateOrder {
  for (const raw of values) {
    const delimited = raw.trim().match(DELIMITED_DATE);
    if (!delimited) continue;
    const a = Number(delimited[1]);
    const b = Number(delimited[2]);
    if (a > 12) return "DMY";
    if (b > 12) return "MDY";
  }
  return "MDY";
}

function isValidDate(year: string, month: string, day: string): boolean {
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  );
}

/**
 * Parses an amount cell (dollars, sign included) into a number, or null if
 * the cell is blank or unparsable. Strips currency symbols and thousands
 * separators, and treats parenthesized amounts ("(12.34)") as negative -
 * some exports use that instead of a leading "-" for a debit.
 */
export function parseImportAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const negativeParens = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[()]/g, "").replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-") return null;

  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;

  return negativeParens ? -Math.abs(value) : value;
}

/**
 * Guesses which row of a parsed import file actually holds the column
 * headers. Some bank exports put a few metadata lines before the real
 * header row (an account name, a statement period) - hardcoding "row 0 is
 * the header" silently turns those into garbage pseudo-columns and tries
 * to import the preamble itself as transactions.
 *
 * Deliberately doesn't look at header text - matching against English
 * words like "date"/"amount" (see HEADER_HINTS below) would miss headers
 * in any other language. Instead this scans for the first row that looks
 * like an actual transaction - some cell parses as a date *and* some
 * other cell parses as an amount - and returns the row right before it,
 * since that's the header row by construction. Falls back to row 0 if no
 * row in the scan window looks like transaction data (e.g. a file with no
 * preamble at all).
 */
export function guessHeaderRowIndex(table: string[][]): number {
  const scanLimit = Math.min(table.length, 12);
  for (let i = 1; i < scanLimit; i++) {
    if (looksLikeDataRow(table[i])) {
      return i - 1;
    }
  }
  return 0;
}

function looksLikeDataRow(row: string[]): boolean {
  const hasDate = row.some((cell) => parseImportDate(cell) !== null);
  const hasAmount = row.some((cell) => parseImportAmount(cell) !== null);
  return hasDate && hasAmount;
}

// Header substrings (checked case-insensitively) used to guess a sensible
// default column mapping from a CSV's header row, so the common case -
// headers named roughly what they are - needs no manual mapping at all.
const HEADER_HINTS = {
  date: ["date"],
  payee: ["payee", "description", "merchant", "name"],
  memo: ["memo", "note"],
  amount: ["amount"],
  inflow: ["inflow", "credit", "deposit"],
  outflow: ["outflow", "debit", "withdrawal"],
} as const;

/** Index of the first header matching one of `hints`, or null. */
export function guessColumn(headers: string[], hints: readonly string[]): number | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const hint of hints) {
    const index = lower.findIndex((h) => h.includes(hint));
    if (index !== -1) return index;
  }
  return null;
}

export { HEADER_HINTS };

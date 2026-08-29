/**
 * Cell-level parsing helpers for File Import (#35). Kept separate from the
 * CSV tokenizer (@/lib/csv) and the column-mapping UI (ImportTransactionsModal)
 * since bank exports vary in date/amount formatting far more than in CSV
 * quoting - these are the two spots most likely to need another format
 * added later.
 */

/**
 * Parses a date cell into an ISO "yyyy-mm-dd" string, or null if the cell
 * doesn't match a format File Import understands. Supports the two formats
 * bank exports actually use in practice: ISO ("2026-08-21", optionally with
 * a time component) and US-style slash dates ("8/21/2026" or "8/21/26").
 */
export function parseImportDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, year, month, day] = iso;
    return isValidDate(year, month, day) ? `${year}-${month}-${day}` : null;
  }

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const [, m, d, yRaw] = slash;
    const year = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const month = m.padStart(2, "0");
    const day = d.padStart(2, "0");
    return isValidDate(year, month, day) ? `${year}-${month}-${day}` : null;
  }

  return null;
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

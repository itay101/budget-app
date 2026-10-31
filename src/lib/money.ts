/**
 * Money is stored as integer "milliunits" (amount * 1000) throughout the
 * app — the same convention YNAB's own API uses. These helpers convert
 * to/from that representation at the UI boundary.
 */

export function milliunitsToNumber(milliunits: number): number {
  return milliunits / 1000;
}

export function numberToMilliunits(amount: number): number {
  return Math.round(amount * 1000);
}

export function formatMilliunits(
  milliunits: number,
  currency: string = "USD",
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(milliunitsToNumber(milliunits));
}

/**
 * formatMilliunits wrapped in a left-to-right isolate (U+2066 … U+2069),
 * for amounts inside text that may run right to left (a Hebrew category
 * name, #148): the minus sign stays on the left, and "₪250 of ₪400" keeps
 * its order.
 */
export function formatMilliunitsLtr(milliunits: number, currency: string = "USD"): string {
  return `\u2066${formatMilliunits(milliunits, currency)}\u2069`;
}

/**
 * Just the symbol for a currency code (e.g. "USD" → "$", "ILS" → "₪") —
 * for compact display like a budget header ("My main budget (₪)") where
 * spelling out the full formatted amount would be noise. Derived from
 * Intl rather than a hand-maintained map, so it stays correct for every
 * code in CURRENCY_OPTIONS without needing its own upkeep.
 */
export function getCurrencySymbol(currency: string): string {
  const part = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? currency;
}

/**
 * `milliunits ÷ parts`, rounded up, in integer arithmetic only: the
 * remainder comes off first, so the one division left is exact. For
 * splitting an amount over months without float rounding (AGENTS.md).
 */
export function ceilDiv(milliunits: number, parts: number): number {
  if (!Number.isSafeInteger(milliunits) || !Number.isSafeInteger(parts) || parts <= 0) {
    throw new RangeError(`ceilDiv needs integer milliunits and a positive integer divisor, got ${milliunits} / ${parts}`);
  }
  const rest = milliunits % parts;
  return (milliunits - rest) / parts + (rest > 0 ? 1 : 0);
}

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
    currencySign: "accounting",
  }).format(milliunitsToNumber(milliunits));
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

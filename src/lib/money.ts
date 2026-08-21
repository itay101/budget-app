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

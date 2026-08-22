/**
 * Currencies a budget can be created in. Deliberately a fixed, curated
 * list rather than the full ISO 4217 set — just enough for a plain
 * <select>, all of them formatting cleanly through Intl.NumberFormat in
 * money.ts. Each budget picks one at creation time and no two budgets may
 * share a currency (see createBudget) — that's what makes a budget's
 * currency also "the" currency for every account inside it.
 */
export const CURRENCY_OPTIONS = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "INR", name: "Indian Rupee" },
  { code: "ILS", name: "Israeli New Shekel" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "ZAR", name: "South African Rand" },
] as const;

export const CURRENCY_CODES = CURRENCY_OPTIONS.map((c) => c.code);

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

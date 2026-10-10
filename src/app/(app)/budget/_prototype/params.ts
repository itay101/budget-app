// PROTOTYPE ONLY (issue #136): turns the budget page's search params into
// the prototype header's props, or null when the prototype is off. Kept out
// of page.tsx so the real page only gains a one-line branch.

import { shiftMonth } from "./months";

type Query = { [key: string]: string | string[] | undefined };

// Never on the production deployment. Vercel previews run with
// NODE_ENV=production, so VERCEL_ENV decides there.
const PROTOTYPE_ENABLED = process.env.VERCEL_ENV
  ? process.env.VERCEL_ENV !== "production"
  : process.env.NODE_ENV !== "production";

const STATES = ["positive", "zero", "negative"] as const;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function clampMonth(
  requested: string,
  min: string,
  max: string,
  fallback: string,
) {
  if (!/^\d{4}-\d{2}$/.test(requested)) return fallback;
  if (requested < min) return min;
  return requested > max ? max : requested;
}

function pick<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((a) => a === value) ?? fallback;
}

function toggles(query: Query, budgetCurrency: string) {
  return {
    state: pick(first(query.rta), STATES, "positive"),
    theme: pick(first(query.theme), ["light", "dark"] as const, "light"),
    names: pick(first(query.names), ["real", "hebrew"], "real"),
    currency: pick(first(query.cur), ["ILS"], budgetCurrency),
    currencyOptions: Array.from(new Set([budgetCurrency, "ILS"])),
  };
}

function prototypeHeader(query: Query, budgetCurrency: string) {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  // Stub range; the real one comes from issue #124's rules.
  const minMonth = shiftMonth(currentMonth, -12);
  const maxMonth = shiftMonth(currentMonth, 12);
  return {
    variant: first(query.variant),
    month: clampMonth(first(query.month), minMonth, maxMonth, currentMonth),
    currentMonth,
    minMonth,
    maxMonth,
    ...toggles(query, budgetCurrency),
  };
}

/**
 * The month the budget page shows, plus the prototype header's props when
 * `?variant=` is set (null otherwise, so the real header renders).
 */
export function budgetPageView(
  query: Query,
  budgetCurrency: string,
  defaultMonth: Date,
) {
  if (!PROTOTYPE_ENABLED || !first(query.variant)) {
    return { month: defaultMonth, prototype: null };
  }
  const prototype = prototypeHeader(query, budgetCurrency);
  const [y, m] = prototype.month.split("-").map(Number);
  // Built the same (server-local) way page.tsx's startOfMonth does, so
  // getBudgetMonthRows sees the month it expects.
  return { month: new Date(y, m - 1, 1), prototype };
}

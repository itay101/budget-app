// Shared query-param scheme + Prisma `where` builder for the transactions
// list filters (date range #19, category #20, inflow/outflow #21,
// memo/payee text #22) — used by both accounts/[id]/page.tsx and
// accounts/all/page.tsx so filtering happens in the DB query instead of
// over the full fetched list (#24), and by TransactionsTable to read/write
// the same params from the URL.
//
// No "use client" here: this needs to run on the server (building a Prisma
// `where` clause) as well as be imported for the plain constant/type it
// exports from client components, so it stays a neutral shared module.

import type { Prisma } from "@prisma/client";
import { DateRangePreset, todayISODate } from "@/lib/dateRange";
import type { FlowFilterValue } from "@/components/FlowFilter";

/** Sentinel value for the "Uncategorized" filter — distinct from "" (all
 * categories) and from any real category id. Doubles as the `category` URL
 * param value, so the client filter control and the server query builder
 * below always agree on it. */
export const UNCATEGORIZED = "__uncategorized__";

const PRESET_KEYS: readonly DateRangePreset[] = ["mtd", "30d", "3m", "ytd", "1y"];

// The URL search-param names the four filters are read from / written to.
export const FILTER_PARAMS = {
  dateFrom: "from",
  dateTo: "to",
  preset: "preset",
  category: "category",
  direction: "direction",
  q: "q",
} as const;

export type TransactionFilters = {
  dateFrom: string; // "" = no lower bound
  dateTo: string; // "" = no upper bound (defaults to today, see below)
  preset: DateRangePreset | null;
  category: string; // "" = all, UNCATEGORIZED = no category, else a category id
  direction: FlowFilterValue;
  q: string; // "" = no free-text filter
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstParam(searchParams: RawSearchParams, key: string): string {
  const value = searchParams[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Parses a page's `searchParams` prop into the four transactions-list
 * filters, applying the same defaults/normalization the filter controls
 * expect (e.g. an unrecognized `direction` falls back to "all"). */
export function parseTransactionFilters(
  searchParams: RawSearchParams,
): TransactionFilters {
  const preset = firstParam(searchParams, FILTER_PARAMS.preset);
  const direction = firstParam(searchParams, FILTER_PARAMS.direction);

  return {
    dateFrom: firstParam(searchParams, FILTER_PARAMS.dateFrom),
    dateTo: firstParam(searchParams, FILTER_PARAMS.dateTo),
    preset: (PRESET_KEYS as string[]).includes(preset)
      ? (preset as DateRangePreset)
      : null,
    category: firstParam(searchParams, FILTER_PARAMS.category),
    direction:
      direction === "inflow" || direction === "outflow" ? direction : "all",
    q: firstParam(searchParams, FILTER_PARAMS.q),
  };
}

// Transaction dates are stored as the UTC midnight instant of the
// `<input type="date">` value they were entered as (`new Date("YYYY-MM-DD")`
// — see updateTransaction/createTransaction), so bounding by the same
// UTC day keeps this consistent with how dates are written.
function startOfDayUTC(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}
function endOfDayUTC(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}

/**
 * The `where` fragment for the four transactions-list filters — spread
 * into a `prisma.transaction.findMany`/`count` call's `where` alongside
 * whatever scopes the query to an account or budget.
 */
export function transactionFiltersWhere(
  filters: TransactionFilters,
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {};

  if (filters.dateFrom || filters.dateTo) {
    // Empty "to" defaults to today rather than "no upper bound".
    where.date = {
      ...(filters.dateFrom ? { gte: startOfDayUTC(filters.dateFrom) } : {}),
      lte: endOfDayUTC(filters.dateTo || todayISODate()),
    };
  }

  if (filters.category === UNCATEGORIZED) {
    where.categoryId = null;
  } else if (filters.category) {
    where.categoryId = filters.category;
  }

  if (filters.direction === "inflow") {
    where.amount = { gt: 0 };
  } else if (filters.direction === "outflow") {
    where.amount = { lt: 0 };
  }

  const q = filters.q.trim();
  if (q) {
    where.OR = [
      { memo: { contains: q, mode: "insensitive" } },
      { payee: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

/** Whether any of the four filters is currently narrowing the list. */
export function hasActiveTransactionFilters(filters: TransactionFilters): boolean {
  return (
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.category !== "" ||
    filters.direction !== "all" ||
    filters.q !== ""
  );
}

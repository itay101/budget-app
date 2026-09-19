"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DateRangePreset, presetDateRange } from "@/lib/dateRange";
import {
  FILTER_PARAMS,
  parseTransactionFiltersFromSearchParams,
} from "@/lib/transactionFilters";
import type { FlowFilterValue } from "@/components/FlowFilter";

/**
 * The four transactions-list filters (#19-#22) TransactionsTable's toolbar
 * reads/writes, plus the memo/payee text filter's own debounced local
 * state. The filters live in the URL rather than component state (see
 * @/lib/transactionFilters) so the server-side query in
 * accounts/[id]/page.tsx / accounts/all/page.tsx can be driven by the same
 * params (#24) - parsing reuses `parseTransactionFiltersFromSearchParams` /
 * `parseTransactionFilters`, the same pure functions that query already
 * goes through, so the two never drift apart on what a given URL means.
 *
 * `searchParams` is the caller's own `useSearchParams()` result, passed in
 * rather than read here, so this hook's return value re-renders in step
 * with whatever else in the caller also depends on it.
 */
export function useTransactionFilters(searchParams: URLSearchParams) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // `updateParams` needs the *current* search params at the time it
  // actually runs, not the ones closed over when its caller was defined -
  // otherwise the debounced memo update below can fire after a later
  // render (e.g. a category change) and clobber it with a stale URL. Kept
  // in sync every render, same as usePopover's onDismissRef.
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const {
    dateFrom,
    dateTo,
    preset,
    category,
    direction: flow,
    q: urlQuery,
  } = parseTransactionFiltersFromSearchParams(searchParams);

  // The memo/payee text filter keeps its own local state so typing feels
  // instant, pushing into the URL on a short debounce instead of
  // navigating on every keystroke like the other filters do.
  const [memoFilter, setMemoFilterState] = useState(urlQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setMemoFilterState(urlQuery);
  }, [urlQuery]);
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Merges `patch` into the current URL's search params (a null value
  // deletes that param) and navigates, so the server component above
  // re-fetches with the new filters. Wrapped in a transition so `isPending`
  // can dim the table while the new query is in flight.
  function updateParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function setMemoFilter(value: string) {
    setMemoFilterState(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ [FILTER_PARAMS.q]: value });
    }, 300);
  }

  // Whether any of the four filters above is currently narrowing the list -
  // drives both the "Clear filters" button and the results summary below
  // the table.
  const hasActiveFilters =
    dateFrom !== "" ||
    dateTo !== "" ||
    category !== "" ||
    flow !== "all" ||
    memoFilter !== "";

  function clearAllFilters() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setMemoFilterState("");
    updateParams({
      [FILTER_PARAMS.dateFrom]: null,
      [FILTER_PARAMS.dateTo]: null,
      [FILTER_PARAMS.preset]: null,
      [FILTER_PARAMS.category]: null,
      [FILTER_PARAMS.direction]: null,
      [FILTER_PARAMS.q]: null,
    });
  }

  function handlePresetChange(preset: DateRangePreset) {
    const range = presetDateRange(preset);
    updateParams({
      [FILTER_PARAMS.dateFrom]: range.from,
      [FILTER_PARAMS.dateTo]: range.to,
      [FILTER_PARAMS.preset]: preset,
    });
  }

  function handleDateFromChange(value: string) {
    updateParams({
      [FILTER_PARAMS.dateFrom]: value,
      [FILTER_PARAMS.preset]: null,
    });
  }

  function handleDateToChange(value: string) {
    updateParams({
      [FILTER_PARAMS.dateTo]: value,
      [FILTER_PARAMS.preset]: null,
    });
  }

  function clearDateFilter() {
    updateParams({
      [FILTER_PARAMS.dateFrom]: null,
      [FILTER_PARAMS.dateTo]: null,
      [FILTER_PARAMS.preset]: null,
    });
  }

  function handleCategoryChange(value: string) {
    updateParams({ [FILTER_PARAMS.category]: value });
  }

  function handleFlowChange(value: FlowFilterValue) {
    updateParams({
      [FILTER_PARAMS.direction]: value === "all" ? null : value,
    });
  }

  return {
    dateFrom,
    dateTo,
    preset,
    category,
    flow,
    memoFilter,
    hasActiveFilters,
    isPending,
    setMemoFilter,
    clearAllFilters,
    handlePresetChange,
    handleDateFromChange,
    handleDateToChange,
    clearDateFilter,
    handleCategoryChange,
    handleFlowChange,
  };
}

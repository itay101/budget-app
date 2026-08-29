"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  formatMilliunits,
  milliunitsToNumber,
  numberToMilliunits,
} from "@/lib/money";
import { DATE_RANGE_PRESETS, DateRangePreset, presetDateRange } from "@/lib/dateRange";
import { FILTER_PARAMS } from "@/lib/transactionFilters";
import { MoneyInput } from "@/components/MoneyInput";
import { Icon } from "@/components/Icon";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { CategoryFilter } from "@/components/CategoryFilter";
import { FlowFilter, FlowFilterValue } from "@/components/FlowFilter";
import { MemoFilter } from "@/components/MemoFilter";

type CategoryOption = { id: string; name: string };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

// The payee name createAccount uses for a nonzero starting balance (see
// src/app/accounts/actions.ts). Identifying a row this way - rather than a
// dedicated column - matches how it's created; these rows aren't real
// spending, so they can't be assigned a category.
const STARTING_BALANCE_PAYEE = "Starting Balance";

type ClearedStatus = "UNCLEARED" | "CLEARED" | "RECONCILED";

type TransactionRowData = {
  id: string;
  date: string; // ISO string
  payeeName: string;
  categoryId: string;
  memo: string;
  amount: number; // milliunits
  cleared: ClearedStatus;
  accountName?: string;
};

type Draft = {
  date: string;
  payeeName: string;
  categoryId: string;
  memo: string;
  inflow: string;
  outflow: string;
};

function draftFrom(t: TransactionRowData): Draft {
  return {
    date: t.date.slice(0, 10),
    payeeName: t.payeeName,
    categoryId: t.categoryId,
    memo: t.memo,
    inflow: t.amount > 0 ? String(milliunitsToNumber(t.amount)) : "",
    outflow: t.amount < 0 ? String(milliunitsToNumber(-t.amount)) : "",
  };
}

// The signed milliunits amount a draft's inflow/outflow pair currently
// represents (same "whichever side has a value wins" rule used when the
// form is actually submitted) - used to show a single net amount in the
// mobile summary row, where inflow/outflow aren't separate columns.
function amountFromDraft(draft: Draft): number {
  const inflow = numberToMilliunits(Number(draft.inflow) || 0);
  const outflow = numberToMilliunits(Number(draft.outflow) || 0);
  return inflow > 0 ? inflow : outflow ? -outflow : 0;
}

function categoryNameFor(
  categoryGroups: GroupOption[],
  categoryId: string,
): string | null {
  for (const group of categoryGroups) {
    const match = group.categories.find((c) => c.id === categoryId);
    if (match) return match.name;
  }
  return null;
}

// e.g. "August 21, 2026" - the date-group header shown on mobile,
// YNAB-style, ahead of each run of same-day transactions.
function formatGroupDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const inputClass =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-body hover:border-neutral-200 focus:border-brand-700 focus:bg-neutral-0 focus:outline-none focus:ring-1 focus:ring-brand-700";

const GRID_COLS_WITH_ACCOUNT =
  "md:grid-cols-[130px_110px_1fr_1fr_1fr_100px_100px_150px]";
const GRID_COLS = "md:grid-cols-[130px_1fr_1fr_1fr_100px_100px_150px]";

export function TransactionsTable({
  transactions,
  totalCount,
  categoryGroups,
  payeeNames,
  updateTransaction,
  deleteTransaction,
  showAccount = false,
  currency = "USD",
}: {
  transactions: TransactionRowData[];
  // Unfiltered transaction count for the account/budget this table shows -
  // used only for the "Showing X of Y" summary and to tell "no transactions
  // at all" apart from "none match the filters" (#24: `transactions` itself
  // now arrives already filtered by the server-side query).
  totalCount: number;
  categoryGroups: GroupOption[];
  payeeNames: string[];
  updateTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (formData: FormData) => Promise<void>;
  showAccount?: boolean;
  currency?: string;
}) {
  const gridCols = showAccount ? GRID_COLS_WITH_ACCOUNT : GRID_COLS;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // The four filters (#19-#22) live in the URL rather than component state
  // (see @/lib/transactionFilters) so the server-side query in
  // accounts/[id]/page.tsx / accounts/all/page.tsx can be driven by the
  // same params (#24) - `transactions` above already reflects them.
  const dateFrom = searchParams.get(FILTER_PARAMS.dateFrom) ?? "";
  const dateTo = searchParams.get(FILTER_PARAMS.dateTo) ?? "";
  const rawPreset = searchParams.get(FILTER_PARAMS.preset);
  const activePreset = DATE_RANGE_PRESETS.some((p) => p.key === rawPreset)
    ? (rawPreset as DateRangePreset)
    : null;
  const categoryFilter = searchParams.get(FILTER_PARAMS.category) ?? "";
  const rawDirection = searchParams.get(FILTER_PARAMS.direction);
  const flowFilter: FlowFilterValue =
    rawDirection === "inflow" || rawDirection === "outflow"
      ? rawDirection
      : "all";
  const urlQuery = searchParams.get(FILTER_PARAMS.q) ?? "";

  // The memo/payee text filter (#22) keeps its own local state so typing
  // feels instant, pushing into the URL on a short debounce instead of
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
    const params = new URLSearchParams(searchParams.toString());
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
    categoryFilter !== "" ||
    flowFilter !== "all" ||
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

  // Consecutive transactions sharing a calendar day get one date-group
  // header between them on mobile (transactions already arrive sorted by
  // date, newest first) - the desktop table still shows a Date column on
  // every row instead, so these headers only render below md.
  let lastDateKey: string | null = null;

  return (
    <div
      className={
        "space-y-2" + (isPending ? " opacity-60 transition-opacity" : "")
      }
    >
      {/* Filter bar: memo/payee search (#22), category (#20), flow (#21),
          and date range (#19), all in one row aligned to the right. A
          "Clear filters" button appears whenever any of them is active,
          both as the indicator that the list is currently filtered and as
          the one-click way to reset all four at once. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
          >
            <Icon name="filter_alt_off" className="text-[1.1em]" />
            Clear filters
          </button>
        )}
        <MemoFilter value={memoFilter} onChange={setMemoFilter} />
        <CategoryFilter
          categoryGroups={categoryGroups}
          value={categoryFilter}
          onChange={handleCategoryChange}
        />
        <FlowFilter value={flowFilter} onChange={handleFlowChange} />
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          activePreset={activePreset}
          onPresetChange={handlePresetChange}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onClear={clearDateFilter}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
        <datalist id="payee-suggestions">
          {payeeNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div
          className={`hidden gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600 md:grid ${gridCols}`}
        >
          <div>Date</div>
          {showAccount && <div>Account</div>}
          <div>Payee</div>
          <div>Category</div>
          <div>Memo</div>
          <div className="text-right">Inflow</div>
          <div className="text-right">Outflow</div>
          <div />
        </div>

        {transactions.map((t) => {
          const dateKey = t.date.slice(0, 10);
          const showDateHeader = dateKey !== lastDateKey;
          lastDateKey = dateKey;

          return (
            <Fragment key={t.id}>
              {showDateHeader && (
                <div className="border-b border-neutral-100 bg-neutral-100 px-200 py-1.5 text-small font-semibold text-neutral-600 md:hidden">
                  {formatGroupDate(t.date)}
                </div>
              )}
              <TransactionRow
                transaction={t}
                categoryGroups={categoryGroups}
                updateTransaction={updateTransaction}
                deleteTransaction={deleteTransaction}
                showAccount={showAccount}
                gridCols={gridCols}
                currency={currency}
              />
            </Fragment>
          );
        })}

        {transactions.length === 0 && (
          <div className="px-200 py-300 text-body text-neutral-600">
            {totalCount === 0
              ? "No transactions yet."
              : "No transactions match the selected filters."}
          </div>
        )}
      </div>

      {/* Result summary + a second "Clear filters" affordance at the end of
          the table, so it's still in reach after scrolling a long list. */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-small text-neutral-600">
          <span>
            Showing {transactions.length} of {totalCount} transaction
            {totalCount === 1 ? "" : "s"} · filters active
          </span>
          <button
            type="button"
            onClick={clearAllFilters}
            className="font-medium text-brand-700 hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

function TransactionRow({
  transaction,
  categoryGroups,
  updateTransaction,
  deleteTransaction,
  showAccount,
  gridCols,
  currency,
}: {
  transaction: TransactionRowData;
  categoryGroups: GroupOption[];
  updateTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (formData: FormData) => Promise<void>;
  showAccount: boolean;
  gridCols: string;
  currency: string;
}) {
  const [pending, startTransition] = useTransition();

  // On mobile, a transaction shows as a compact YNAB-style summary row
  // until tapped; `expanded` reveals the full editor below it. Desktop
  // ignores this entirely and always shows the editor as a table row.
  const [expanded, setExpanded] = useState(false);

  // `committed` tracks the last-saved state (what the summary row shows,
  // and what Cancel reverts to); `draft` is what's currently in the
  // inputs. Editing only ever touches `draft` - nothing is sent to the
  // server until Submit.
  const [committed, setCommitted] = useState(() => draftFrom(transaction));
  const [draft, setDraft] = useState(committed);

  // The row's "more actions" menu (currently just Delete) - a small popover
  // off the kebab button, same open/position/outside-click pattern as
  // MoveMoneyPopover.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function updatePosition() {
      const rect = menuButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 160; // matches the menu's w-40
      setMenuPosition({
        top: rect.bottom + 4,
        left: Math.min(rect.right - width, window.innerWidth - width - 8),
      });
    }
    updatePosition();

    function handlePointerDown(e: MouseEvent) {
      if (
        menuRef.current?.contains(e.target as Node) ||
        menuButtonRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const isDirty =
    draft.date !== committed.date ||
    draft.payeeName !== committed.payeeName ||
    draft.categoryId !== committed.categoryId ||
    draft.memo !== committed.memo ||
    draft.inflow !== committed.inflow ||
    draft.outflow !== committed.outflow;

  function patch(fields: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...fields }));
  }

  function handleCancel() {
    setDraft(committed);
  }

  function handleSubmit() {
    const inflowValue = Number(draft.inflow) || 0;
    const outflowValue = Number(draft.outflow) || 0;
    const amount = inflowValue > 0 ? inflowValue : outflowValue ? -outflowValue : 0;

    const formData = new FormData();
    formData.set("transactionId", transaction.id);
    formData.set("date", draft.date);
    formData.set("payeeName", draft.payeeName);
    formData.set("categoryId", draft.categoryId);
    formData.set("memo", draft.memo);
    formData.set("amount", String(amount));

    startTransition(async () => {
      await updateTransaction(formData);
      setCommitted(draft);
      setExpanded(false);
    });
  }

  function handleDelete() {
    setMenuOpen(false);
    if (!window.confirm("Delete this transaction? This can't be undone.")) {
      return;
    }
    const formData = new FormData();
    formData.set("transactionId", transaction.id);
    startTransition(async () => {
      await deleteTransaction(formData);
    });
  }

  const categoryName = categoryNameFor(categoryGroups, committed.categoryId);
  const summaryAmount = amountFromDraft(committed);
  const isStartingBalance = transaction.payeeName === STARTING_BALANCE_PAYEE;
  const isReconciled = transaction.cleared === "RECONCILED";

  return (
    <div
      className={
        "border-b border-neutral-100 text-body last:border-b-0 " +
        (isDirty ? "bg-brand-700/5" : "")
      }
    >
      {/* Mobile-only: a compact summary row (payee, category pill, amount)
          you tap to open the editor below - the desktop table never shows
          this, it always renders the editor as a normal row instead. */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={
          (expanded ? "hidden " : "flex ") +
          "w-full items-start justify-between gap-3 px-200 py-3 text-left md:hidden"
        }
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1 truncate font-semibold text-neutral-800">
            {isReconciled && (
              <Icon
                name="lock"
                label="Reconciled"
                className="shrink-0 text-[1rem] text-neutral-400"
              />
            )}
            <span className="truncate">
              {committed.payeeName || "(No payee)"}
            </span>
          </div>
          <span className="mt-1 inline-block max-w-full truncate rounded-full bg-neutral-100 px-2 py-0.5 text-small text-neutral-600">
            {categoryName ?? "Uncategorized"}
          </span>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={
              "font-medium " +
              (summaryAmount < 0 ? "text-neutral-800" : "text-success")
            }
          >
            {formatMilliunits(summaryAmount, currency)}
          </div>
          {showAccount && (
            <div className="mt-0.5 max-w-[10rem] truncate text-small text-neutral-600">
              {transaction.accountName}
            </div>
          )}
        </div>
      </button>

      <div
        className={
          (expanded ? "grid " : "hidden ") +
          `grid-cols-2 gap-x-3 gap-y-2 px-200 py-3 md:grid md:items-center md:gap-2 md:py-1 ${gridCols}`
        }
      >
        {/* Mobile-only: collapse back to the summary row without needing
            to Cancel or Save first. */}
        <div className="col-span-2 -mb-1 flex justify-end md:hidden">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            title="Collapse"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <Icon name="expand_less" label="Collapse" />
          </button>
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="mb-1 block text-small text-neutral-600 md:hidden">
            Date
          </label>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => patch({ date: e.target.value })}
            className={inputClass}
          />
        </div>

        {showAccount && (
          <div className="col-span-2 truncate text-neutral-600 md:col-span-1 md:px-1">
            <span className="mr-1 text-small md:hidden">Account:</span>
            {transaction.accountName}
          </div>
        )}

        <div className="col-span-2 md:col-span-1">
          <label className="mb-1 block text-small text-neutral-600 md:hidden">
            Payee
          </label>
          <input
            type="text"
            value={draft.payeeName}
            list="payee-suggestions"
            placeholder="Payee"
            onChange={(e) => patch({ payeeName: e.target.value })}
            className={inputClass}
          />
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="mb-1 block text-small text-neutral-600 md:hidden">
            Category
          </label>
          {isStartingBalance ? (
            <div
              className={inputClass + " text-neutral-400"}
              title="Starting balance can't be categorized"
            >
              Uncategorized
            </div>
          ) : (
            <select
              value={draft.categoryId}
              onChange={(e) => patch({ categoryId: e.target.value })}
              className={inputClass}
            >
              <option value="">Uncategorized</option>
              {categoryGroups.map((group) => (
                <optgroup key={group.id} label={group.name}>
                  {group.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="mb-1 block text-small text-neutral-600 md:hidden">
            Memo
          </label>
          <input
            type="text"
            value={draft.memo}
            placeholder="Memo"
            onChange={(e) => patch({ memo: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-small text-neutral-600 md:hidden">
            Inflow
          </label>
          <MoneyInput
            currency={currency}
            value={draft.inflow}
            placeholder="0.00"
            onChange={(e) => patch({ inflow: e.target.value, outflow: "" })}
            className={inputClass + " text-right text-success"}
          />
        </div>

        <div>
          <label className="mb-1 block text-small text-neutral-600 md:hidden">
            Outflow
          </label>
          <MoneyInput
            currency={currency}
            value={draft.outflow}
            placeholder="0.00"
            onChange={(e) => patch({ outflow: e.target.value, inflow: "" })}
            className={inputClass + " text-right text-danger"}
          />
        </div>

        <div className="col-span-2 flex justify-end gap-1 md:col-span-1">
          {isDirty && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                disabled={pending}
                title="Cancel"
                className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
              >
                <Icon name="close" label="Cancel" />
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending}
                title="Save"
                className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {pending ? "…" : <Icon name="check" label="Save" />}
              </button>
            </>
          )}
          {isReconciled && (
            <span title="Reconciled" className="p-1 text-neutral-400">
              <Icon name="lock" label="Reconciled" />
            </span>
          )}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={pending}
            title="More actions"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
          >
            <Icon name="more_vert" label="More actions" />
          </button>
          {menuOpen &&
            menuPosition &&
            createPortal(
              <div
                ref={menuRef}
                style={{
                  position: "fixed",
                  top: menuPosition.top,
                  left: menuPosition.left,
                }}
                className="z-50 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0 py-1 shadow-lg"
              >
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-small text-danger hover:bg-danger/10"
                >
                  <Icon name="delete" />
                  Delete
                </button>
              </div>,
              document.body,
            )}
        </div>
      </div>
    </div>
  );
}

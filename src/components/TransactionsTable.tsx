"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  formatMilliunits,
  milliunitsToNumber,
  numberToMilliunits,
} from "@/lib/money";
import {
  DATE_RANGE_PRESETS,
  DateRangePreset,
  presetDateRange,
  todayISODate,
} from "@/lib/dateRange";
import { FILTER_PARAMS } from "@/lib/transactionFilters";
import { MoneyInput } from "@/components/MoneyInput";
import { Icon } from "@/components/Icon";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { CategoryFilter } from "@/components/CategoryFilter";
import { FlowFilter, FlowFilterValue } from "@/components/FlowFilter";
import { MemoFilter } from "@/components/MemoFilter";
import { useReconciliation } from "@/components/ReconciliationContext";

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

// The blank draft a new-transaction row (#34) starts from - today's date,
// everything else empty, same shape TransactionRow already edits.
function blankDraft(): Draft {
  return {
    date: todayISODate(),
    payeeName: "",
    categoryId: "",
    memo: "",
    inflow: "",
    outflow: "",
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
  createTransaction,
  updateTransaction,
  deleteTransaction,
  reconcileTransaction,
  unreconcileTransaction,
  showAccount = false,
  currency = "USD",
  accountBalance,
  accountId,
}: {
  transactions: TransactionRowData[];
  // Unfiltered transaction count for the account/budget this table shows -
  // used only for the "Showing X of Y" summary and to tell "no transactions
  // at all" apart from "none match the filters" (#24: `transactions` itself
  // now arrives already filtered by the server-side query).
  totalCount: number;
  categoryGroups: GroupOption[];
  payeeNames: string[];
  // Only passed (together with `accountId`) on the single-account page
  // (#34) - accounts/all has no single implicit account for a new
  // transaction to land on, so "Add Transaction" doesn't render there.
  createTransaction?: (formData: FormData) => Promise<void>;
  updateTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (formData: FormData) => Promise<void>;
  reconcileTransaction: (formData: FormData) => Promise<void>;
  unreconcileTransaction: (formData: FormData) => Promise<void>;
  showAccount?: boolean;
  currency?: string;
  // The owning account's live cached balance (#31) - only passed on the
  // single-account page, where it drives the pinned reconciliation bar
  // rendered above the table. Omitted on accounts/all, where "the account
  // total" isn't a single number and reconciliation doesn't apply.
  accountBalance?: number;
  accountId?: string;
}) {
  const gridCols = showAccount ? GRID_COLS_WITH_ACCOUNT : GRID_COLS;

  // Whether the blank "Add Transaction" row is currently open above the
  // list (#34). Only meaningful when createTransaction/accountId were
  // passed in - the button that sets this is hidden otherwise.
  const [addingNew, setAddingNew] = useState(false);

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
      {accountBalance !== undefined && (
        <ReconciliationBar balance={accountBalance} currency={currency} />
      )}

      {/* Toolbar: "Add Transaction" (#34) on the left, opening a blank
          expanded row at the top of the table; the filter bar (memo/payee
          search #22, category #20, flow #21, date range #19) on the right.
          A "Clear filters" button appears whenever any filter is active,
          both as the indicator that the list is currently filtered and as
          the one-click way to reset all four at once. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {createTransaction && accountId ? (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            disabled={addingNew}
            className="flex items-center gap-1 rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            <Icon name="add" className="text-[1.1em]" />
            Add Transaction
          </button>
        ) : (
          <div />
        )}
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

        {addingNew && createTransaction && accountId && (
          <NewTransactionRow
            accountId={accountId}
            categoryGroups={categoryGroups}
            createTransaction={createTransaction}
            gridCols={gridCols}
            currency={currency}
            onClose={() => setAddingNew(false)}
          />
        )}

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
                reconcileTransaction={reconcileTransaction}
                unreconcileTransaction={unreconcileTransaction}
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

/**
 * The pinned row shown above the transactions table while reconciling an
 * account (#31) - entered via `ReconcileButton` answering "No" to the
 * proposed total. Tracks the live gap between the statement amount the
 * user entered and `account.balance`, which keeps moving as transactions
 * are added/edited/deleted on the account (those all go through
 * revalidatePath, so `balance` here is always current). Renders nothing
 * once reconciling hasn't been started, or outside a ReconciliationProvider
 * (accounts/all's table never passes `accountBalance`, so this never
 * mounts there).
 */
function ReconciliationBar({
  balance,
  currency,
}: {
  balance: number;
  currency: string;
}) {
  const reconciliation = useReconciliation();
  const [pending, startTransition] = useTransition();

  if (!reconciliation || reconciliation.statementAmount === null) return null;

  const { accountId, reconcileAccount, statementAmount, cancelReconciling } =
    reconciliation;
  const gap = statementAmount - balance;
  const matched = gap === 0;

  function handleReconcile() {
    const formData = new FormData();
    formData.set("accountId", accountId);
    startTransition(async () => {
      await reconcileAccount(formData);
      cancelReconciling();
    });
  }

  function handleCancel() {
    if (window.confirm("Stop reconciling this account? Nothing will change.")) {
      cancelReconciling();
    }
  }

  return (
    <div
      className={
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-200 py-2 text-body " +
        (matched
          ? "border-success/30 bg-success/10 text-success"
          : "border-warning/30 bg-warning/10 text-neutral-800")
      }
    >
      <div className="flex items-center gap-2">
        <Icon
          name={matched ? "check_circle" : "sync_problem"}
          className="text-[1.1em]"
        />
        {matched ? (
          <span className="font-medium">
            Statement amount matches the account total.
          </span>
        ) : (
          <span>
            Reconciling — gap of{" "}
            <span className="font-semibold">
              {formatMilliunits(gap, currency)}
            </span>{" "}
            between the statement amount and this account&#39;s total.
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {matched && (
          <button
            type="button"
            onClick={handleReconcile}
            disabled={pending}
            className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {pending ? "Reconciling…" : "Reconcile"}
          </button>
        )}
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TransactionRow({
  transaction,
  categoryGroups,
  updateTransaction,
  deleteTransaction,
  reconcileTransaction,
  unreconcileTransaction,
  showAccount,
  gridCols,
  currency,
}: {
  transaction: TransactionRowData;
  categoryGroups: GroupOption[];
  updateTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (formData: FormData) => Promise<void>;
  reconcileTransaction: (formData: FormData) => Promise<void>;
  unreconcileTransaction: (formData: FormData) => Promise<void>;
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
    if (
      transaction.cleared === "RECONCILED" &&
      !window.confirm("This transaction is reconciled. Save changes anyway?")
    ) {
      return;
    }

    const inflowValue = Number(draft.inflow) || 0;
    const outflowValue = Number(draft.outflow) || 0;
    const amount =
      inflowValue > 0 ? inflowValue : outflowValue ? -outflowValue : 0;

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

  function handleReconcile() {
    if (!window.confirm("Mark this transaction as reconciled?")) {
      return;
    }
    const formData = new FormData();
    formData.set("transactionId", transaction.id);
    startTransition(async () => {
      await reconcileTransaction(formData);
    });
  }

  function handleUnreconcile() {
    if (
      !window.confirm(
        "Un-reconcile this transaction? It will no longer count as reconciled.",
      )
    ) {
      return;
    }
    const formData = new FormData();
    formData.set("transactionId", transaction.id);
    startTransition(async () => {
      await unreconcileTransaction(formData);
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
            <Icon
              name={isReconciled ? "lock" : "lock_open"}
              label={isReconciled ? "Reconciled" : "Not reconciled"}
              className={
                "shrink-0 text-[1rem] " +
                (isReconciled ? "text-brand-700" : "text-neutral-400")
              }
            />
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
            <Icon name="expand_less" label="Collapse" className="text-[1.1em]" />
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
                <Icon name="close" label="Cancel" className="text-[1.1em]" />
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending}
                title="Save"
                className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {pending ? (
                  "…"
                ) : (
                  <Icon name="check" label="Save" className="text-[1.1em]" />
                )}
              </button>
            </>
          )}
          {isReconciled ? (
            <button
              type="button"
              onClick={handleUnreconcile}
              disabled={pending}
              title="Un-reconcile"
              className="rounded p-1 text-brand-700 hover:bg-brand-700/10 disabled:opacity-50"
            >
              <Icon
                name="lock"
                label="Un-reconcile transaction"
                className="text-[1.1em]"
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReconcile}
              disabled={pending}
              title="Reconcile"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
            >
              <Icon
                name="lock_open"
                label="Reconcile transaction"
                className="text-[1.1em]"
              />
            </button>
          )}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={pending}
            title="More actions"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
          >
            <Icon
              name="more_vert"
              label="More actions"
              className="text-[1.1em]"
            />
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
                  <Icon name="delete" className="text-[1.1em]" />
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

/**
 * The blank, already-expanded row opened by "Add Transaction" (#34) - shown
 * at the top of the list while `addingNew`. Reuses TransactionRow's
 * date/payee/category/memo/inflow/outflow fields (same `Draft` shape,
 * `MoneyInput`, payee `datalist`, category `optgroup`s) rather than a
 * separate editor, but there's no committed transaction yet: no
 * mobile-summary toggle, reconcile, or delete - just Cancel (discard),
 * Save (commit + close), and "Save and add another" (commit + stay open on
 * a fresh blank draft) for entering several transactions back-to-back.
 */
function NewTransactionRow({
  accountId,
  categoryGroups,
  createTransaction,
  gridCols,
  currency,
  onClose,
}: {
  accountId: string;
  categoryGroups: GroupOption[];
  createTransaction: (formData: FormData) => Promise<void>;
  gridCols: string;
  currency: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(blankDraft);

  function patch(fields: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...fields }));
  }

  function formDataFromDraft() {
    const inflowValue = Number(draft.inflow) || 0;
    const outflowValue = Number(draft.outflow) || 0;
    const amount =
      inflowValue > 0 ? inflowValue : outflowValue ? -outflowValue : 0;

    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("date", draft.date);
    formData.set("payeeName", draft.payeeName);
    formData.set("categoryId", draft.categoryId);
    formData.set("memo", draft.memo);
    formData.set("amount", String(amount));
    return formData;
  }

  function handleSave() {
    const formData = formDataFromDraft();
    startTransition(async () => {
      await createTransaction(formData);
      onClose();
    });
  }

  function handleSaveAndAddAnother() {
    const formData = formDataFromDraft();
    startTransition(async () => {
      await createTransaction(formData);
      setDraft(blankDraft());
    });
  }

  return (
    <div className="border-b border-neutral-100 bg-brand-700/5 text-body">
      <div
        className={`grid grid-cols-2 gap-x-3 gap-y-2 px-200 py-3 md:grid md:items-center md:gap-2 md:py-1 ${gridCols}`}
      >
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
      </div>

      {/* Actions get their own row below the input fields rather than
          squeezing into the table's narrow trailing column - unlike
          TransactionRow's icon-only actions, "Save and add another" needs
          the room. On desktop this row reuses gridCols and spans every
          field column but the last (`[grid-column:1/-2]`) so the button
          group's right edge lines up with Outflow's above it, instead of
          drifting into the trailing column TransactionRow reserves for its
          icon actions - which this row leaves empty. */}
      <div
        className={`flex border-t border-neutral-100 px-200 pb-3 pt-2 md:grid md:items-center md:gap-2 md:pb-2 md:pt-1 ${gridCols}`}
      >
        <div className="flex flex-1 flex-wrap justify-end gap-1 md:flex-none md:[grid-column:1/-2]">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            title="Cancel"
            className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveAndAddAnother}
            disabled={pending}
            title="Save and add another"
            className="rounded border border-brand-700 px-2 py-1 text-small font-medium text-brand-700 hover:bg-brand-700/10 disabled:opacity-50"
          >
            {pending ? "…" : "Save and add another"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            title="Save"
            className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {pending ? "…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

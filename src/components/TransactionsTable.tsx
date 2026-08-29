"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  formatMilliunits,
  milliunitsToNumber,
  numberToMilliunits,
} from "@/lib/money";
import { DateRangePreset, presetDateRange, todayISODate } from "@/lib/dateRange";
import { MoneyInput } from "@/components/MoneyInput";
import { Icon } from "@/components/Icon";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { CategoryFilter, UNCATEGORIZED } from "@/components/CategoryFilter";
import { FlowFilter, FlowFilterValue } from "@/components/FlowFilter";

type CategoryOption = { id: string; name: string };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

type TransactionRowData = {
  id: string;
  date: string; // ISO string
  payeeName: string;
  categoryId: string;
  memo: string;
  amount: number; // milliunits
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
  categoryGroups,
  payeeNames,
  updateTransaction,
  deleteTransaction,
  showAccount = false,
  currency = "USD",
}: {
  transactions: TransactionRowData[];
  categoryGroups: GroupOption[];
  payeeNames: string[];
  updateTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (formData: FormData) => Promise<void>;
  showAccount?: boolean;
  currency?: string;
}) {
  const gridCols = showAccount ? GRID_COLS_WITH_ACCOUNT : GRID_COLS;

  // Date-range filter state. `dateFrom`/`dateTo` are the source of truth
  // (empty string = no bound); `activePreset` just tracks which preset
  // button, if any, produced the current range, so it can stay highlighted
  // until the user edits From/To by hand.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<DateRangePreset | null>(
    null,
  );

  // Category filter state. "" = all categories, UNCATEGORIZED = transactions
  // with no categoryId, otherwise a specific category id.
  const [categoryFilter, setCategoryFilter] = useState("");

  // Inflow/Outflow filter state (ticket #21). "all" is the default,
  // unfiltered state; matches the existing Inflow/Outflow column split
  // (positive amount = inflow, negative = outflow).
  const [flowFilter, setFlowFilter] = useState<FlowFilterValue>("all");

  const filteredTransactions = useMemo(() => {
    // Empty "to" defaults to today rather than "no upper bound".
    const effectiveTo = dateTo || todayISODate();
    return transactions.filter((t) => {
      const dateKey = t.date.slice(0, 10);
      if (dateFrom || dateTo) {
        if (dateKey > effectiveTo) return false;
        if (dateFrom && dateKey < dateFrom) return false;
      }
      if (categoryFilter === UNCATEGORIZED) {
        if (t.categoryId) return false;
      } else if (categoryFilter && t.categoryId !== categoryFilter) {
        return false;
      }
      if (flowFilter === "inflow" && t.amount <= 0) return false;
      if (flowFilter === "outflow" && t.amount >= 0) return false;
      return true;
    });
  }, [transactions, dateFrom, dateTo, categoryFilter, flowFilter]);

  function handlePresetChange(preset: DateRangePreset) {
    const range = presetDateRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setActivePreset(preset);
  }

  function handleDateFromChange(value: string) {
    setDateFrom(value);
    setActivePreset(null);
  }

  function handleDateToChange(value: string) {
    setDateTo(value);
    setActivePreset(null);
  }

  function clearDateFilter() {
    setDateFrom("");
    setDateTo("");
    setActivePreset(null);
  }

  // Consecutive transactions sharing a calendar day get one date-group
  // header between them on mobile (transactions already arrive sorted by
  // date, newest first) - the desktop table still shows a Date column on
  // every row instead, so these headers only render below md.
  let lastDateKey: string | null = null;

  return (
    <div className="space-y-2">
      {/* Filter bar: this is where #22's filter joins the date, category,
          and flow filters below, all in one row aligned to the right. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <CategoryFilter
          categoryGroups={categoryGroups}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
        <FlowFilter value={flowFilter} onChange={setFlowFilter} />
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

        {filteredTransactions.map((t) => {
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

        {filteredTransactions.length === 0 && (
          <div className="px-200 py-300 text-body text-neutral-600">
            {transactions.length === 0
              ? "No transactions yet."
              : "No transactions match the selected filters."}
          </div>
        )}
      </div>
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
          <div className="truncate font-semibold text-neutral-800">
            {committed.payeeName || "(No payee)"}
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
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            title="Delete transaction"
            className="rounded p-1 text-neutral-400 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            <Icon name="delete" label="Delete transaction" />
          </button>
        </div>
      </div>
    </div>
  );
}

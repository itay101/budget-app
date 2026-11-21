"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { formatMilliunits, milliunitsToNumber } from "@/lib/money";
import {
  amountFromDraft,
  applyPayeeChange,
  draftAmountInput,
  type Draft,
} from "@/lib/transactionDraft";
import { todayISODate } from "@/lib/dateRange";
import { MoneyInput } from "@/components/MoneyInput";
import { CategoryOptions } from "@/components/CategoryOptions";
import { Icon } from "@/components/Icon";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { CategoryFilter } from "@/components/CategoryFilter";
import { FlowFilter } from "@/components/FlowFilter";
import { MemoFilter } from "@/components/MemoFilter";
import { usePopover } from "@/components/usePopover";
import { useTransactionFilters } from "@/components/useTransactionFilters";
import { useReconciliation } from "@/components/ReconciliationContext";
import { ImportTransactionsModal } from "@/components/ImportTransactionsModal";
import { useServerAction } from "@/components/useServerAction";
import type { AccountType } from "@/lib/accountTypes";
import { STARTING_BALANCE_PAYEE } from "@/lib/payees";
import { PayeeInput } from "@/components/PayeeInput";
import {
  matchingTransferAccount,
  transferCategoryPlacement,
  transferPayeeLabel,
  type TransferAccountOption,
  type TransferLinkCandidate,
} from "@/lib/transfers";
import {
  bulkDeleteMessage,
  categoryEditorState,
  linkOfferMessage,
  toRowData,
  type TransactionInput,
  type TransactionRowData,
} from "@/lib/transferEditor";

export type { TransactionInput };

type CategoryOption = { id: string; name: string };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

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

function confirmTransferLink(accountName: string, candidates: TransferLinkCandidate[]): string | null {
  const message = linkOfferMessage(accountName, candidates);
  if (!message || !window.confirm(message)) return null;
  return candidates[0].id;
}

function linkTarget(
  transfer: { id: string; name: string } | null,
  currentId: string,
): { id: string; name: string } | null {
  if (!transfer || transfer.id === currentId) return null;
  return transfer;
}

function accountIdOf(transfer: { id: string } | null): string {
  if (!transfer) return "";
  return transfer.id;
}

function confirmUnlinkValue(currentId: string, transfer: { id: string } | null): string | undefined {
  if (currentId && !transfer) return "true";
  return undefined;
}

function declined(message: string | null): boolean {
  return message !== null && !window.confirm(message);
}

function reconcilePrompt(cleared: string, counterpartCleared: string | null): string | null {
  if (cleared === "RECONCILED" || counterpartCleared === "RECONCILED") {
    return "This transaction is reconciled. Save changes anyway?";
  }
  return null;
}

function unlinkPrompt(currentName: string, stillTransfer: boolean): string | null {
  if (!currentName || stillTransfer) return null;
  return `This will unlink the transfer and delete the other side in ${currentName}. Continue?`;
}

async function offerToLink(
  run: (fields: Record<string, string | undefined>) => Promise<TransferLinkCandidate[] | undefined>,
  transfer: { id: string; name: string } | null,
  fields: { sourceAccountId: string; date: string; amount: string; excludeTransactionId?: string },
): Promise<string | undefined> {
  if (!transfer) return undefined;
  const candidates =
    (await run({
      accountId: transfer.id,
      sourceAccountId: fields.sourceAccountId,
      date: fields.date,
      amount: fields.amount,
      excludeTransactionId: fields.excludeTransactionId,
    })) ?? [];
  return confirmTransferLink(transfer.name, candidates) ?? undefined;
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
  "w-full rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-body hover:border-neutral-200 focus:border-brand-700 focus:bg-neutral-0 focus:outline-hidden focus:ring-1 focus:ring-brand-700";

// The trailing column is icon-only actions (reconcile/kebab) rather than a
// labeled field, so it's sized to just fit those two buttons - not the
// ~150px a labeled column would need - leaving the rest of the row to the
// fields. A dirty row's Cancel/Save go in a strip below the fields
// instead of widening this column for that transient case.
// The leading column is the bulk-select checkbox (#41) - just wide enough
// for the input itself, desktop-only (mobile selects from the summary row
// instead, see TransactionRow).
const GRID_COLS_WITH_ACCOUNT =
  "md:grid-cols-[28px_130px_110px_1fr_1fr_1fr_100px_100px_80px]";
const GRID_COLS = "md:grid-cols-[28px_130px_1fr_1fr_1fr_100px_100px_80px]";

// fallow-ignore-next-line complexity
export function TransactionsTable({
  transactions,
  totalCount,
  categoryGroups,
  payeeNames,
  payeeLastCategory,
  transferAccounts,
  findTransferLinkCandidates,
  accountOnBudget = true,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  deleteTransactions,
  reconcileTransaction,
  unreconcileTransaction,
  checkImportDuplicates,
  importTransactions,
  columnDetection,
  showAccount = false,
  currency = "USD",
  accountBalance,
  accountId,
  accountType,
}: {
  transactions: TransactionInput[];
  // Unfiltered transaction count for the account/budget this table shows -
  // used only for the "Showing X of Y" summary and to tell "no transactions
  // at all" apart from "none match the filters" (#24: `transactions` itself
  // now arrives already filtered by the server-side query).
  totalCount: number;
  categoryGroups: GroupOption[];
  payeeNames: string[];
  // Per-payee default category (#88): the categoryId of that payee's most
  // recent categorized transaction, keyed by payee name (same key space as
  // `payeeNames`) - used to auto-fill a row's category as soon as its
  // payee is set, as long as the row doesn't already have one.
  payeeLastCategory: Record<string, string>;
  /** Open accounts in this budget, offered as transfer payees (ADR 0007). */
  transferAccounts: TransferAccountOption[];
  findTransferLinkCandidates: (formData: FormData) => Promise<TransferLinkCandidate[]>;
  /** The account a new row is added to. Existing rows carry their own. */
  accountOnBudget?: boolean;
  // Only passed (together with `accountId`) on the single-account page
  // (#34) - accounts/all has no single implicit account for a new
  // transaction to land on, so "Add Transaction" doesn't render there.
  createTransaction?: (formData: FormData) => Promise<void>;
  updateTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (formData: FormData) => Promise<void>;
  // Bulk delete (#41) for the "Delete N selected" action - takes a
  // "transactionIds" JSON array instead of deleteTransaction's single
  // "transactionId".
  deleteTransactions: (formData: FormData) => Promise<void>;
  reconcileTransaction: (formData: FormData) => Promise<void>;
  unreconcileTransaction: (formData: FormData) => Promise<void>;
  // File Import (#35) - same single-account-only gating as
  // createTransaction/accountId above, since a bulk import also needs one
  // implicit destination account.
  checkImportDuplicates?: (formData: FormData) => Promise<boolean[]>;
  importTransactions?: (formData: FormData) => Promise<void>;
  showAccount?: boolean;
  currency?: string;
  // The owning account's live cached balance (#31) - only passed on the
  // single-account page, where it drives the pinned reconciliation bar
  // rendered above the table. Omitted on accounts/all, where "the account
  // total" isn't a single number and reconciliation doesn't apply.
  accountBalance?: number;
  accountId?: string;
  // The owning account's type (#35) - only used to default File Import's
  // "flip sign" toggle for a Credit Card account, where a statement's
  // "charge amount" column is conventionally reported as a positive number
  // even though it's an outflow. Omitted wherever accountId/accountBalance
  // are, for the same single-account-only reason.
  accountType?: AccountType;
  // Whether File Import may ask AI to detect columns (#197) - false unless
  // the server has an AI Gateway credential.
  columnDetection?: boolean;
}) {
  const gridCols = showAccount ? GRID_COLS_WITH_ACCOUNT : GRID_COLS;

  // The rows this table actually renders - mapped once from the raw
  // `transactions` prop (see TransactionInput/toRowData above) rather than
  // asking every caller to pre-shape its own copy. Memoized so its identity
  // only changes when `transactions` itself does, same as the prop it
  // replaces - the pruning effect below depends on that.
  const rows = useMemo(() => transactions.map(toRowData), [transactions]);

  // Whether the blank "Add Transaction" row is currently open above the
  // list (#34). Only meaningful when createTransaction/accountId were
  // passed in - the button that sets this is hidden otherwise.
  const [addingNew, setAddingNew] = useState(false);

  // Whether the File Import modal (#35) is open. Same gating as
  // addingNew - only meaningful when importTransactions/accountId were
  // passed in.
  const [importOpen, setImportOpen] = useState(false);

  // The bulk-select checkboxes' current selection (#41), by transaction id.
  // Pruned below whenever the (filtered) transaction list changes, so a
  // selection can't outlive rows that scrolled out of the current filter or
  // were just deleted.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const {
    run: runBulkDelete,
    pending: bulkDeletePending,
    error: bulkDeleteError,
  } = useServerAction(deleteTransactions);

  useEffect(() => {
    setSelectedIds((prev) => {
      const visibleIds = new Set(rows.map((t) => t.id));
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((t) => t.id)));
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (count === 0) return;
    const includesTransfer = rows.some((row) => selectedIds.has(row.id) && Boolean(row.transferAccountId));
    if (!window.confirm(bulkDeleteMessage(count, includesTransfer))) return;
    try {
      await runBulkDelete({
        transactionIds: JSON.stringify([...selectedIds]),
      });
      setSelectedIds(new Set());
    } catch {
      // error is surfaced via bulkDeleteError
    }
  }

  const searchParams = useSearchParams();
  const {
    dateFrom,
    dateTo,
    preset: activePreset,
    category: categoryFilter,
    flow: flowFilter,
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
  } = useTransactionFilters(searchParams);

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

      {importOpen &&
        checkImportDuplicates &&
        importTransactions &&
        accountId && (
          <ImportTransactionsModal
            accountId={accountId}
            accountType={accountType}
            columnDetection={columnDetection}
            currency={currency}
            checkImportDuplicates={checkImportDuplicates}
            importTransactions={importTransactions}
            onClose={() => setImportOpen(false)}
          />
        )}

      {/* Toolbar: "Add Transaction" (#34) on the left, opening a blank
          expanded row at the top of the table; the filter bar (memo/payee
          search #22, category #20, flow #21, date range #19) on the right.
          A "Clear filters" button appears whenever any filter is active,
          both as the indicator that the list is currently filtered and as
          the one-click way to reset all four at once. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {createTransaction && accountId ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              disabled={addingNew}
              className="flex items-center gap-1 rounded-sm bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              <Icon name="add" className="text-[1.1em]" />
              Add Transaction
            </button>
            {checkImportDuplicates && importTransactions && (
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1 rounded-sm border border-neutral-200 px-2 py-1 text-small font-medium text-neutral-700 hover:bg-neutral-100"
              >
                <Icon name="upload_file" className="text-[1.1em]" />
                File Import
              </button>
            )}
          </div>
        ) : (
          <div />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="flex items-center gap-1 rounded-sm border border-neutral-200 px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
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

      {/* Bulk action bar (#41) - appears once any row's checkbox is
          checked, either from a row itself (mobile summary or desktop
          editor) or the header's "select all". Sits in place of, rather
          than alongside, the toolbar's own affordances so it's unambiguous
          which action a click applies to while a selection is active. */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-700/30 bg-brand-700/5 px-200 py-2 text-body">
          <span className="font-medium text-neutral-800">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkDeletePending}
              className="rounded-sm px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
            >
              Clear selection
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeletePending}
              className="flex items-center gap-1 rounded-sm bg-danger px-2 py-1 text-small font-medium text-white hover:bg-danger/90 disabled:opacity-50"
            >
              <Icon name="delete" className="text-[1.1em]" />
              {bulkDeletePending ? "Deleting…" : `Delete ${selectedIds.size}`}
            </button>
          </div>
          {bulkDeleteError && (
            <p className="w-full text-small text-danger">{bulkDeleteError}</p>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
        <datalist id="payee-suggestions">
          {payeeNames.map((name) => (
            <option key={name} value={name} />
          ))}
          {transferAccounts.map((account) => (
            <option key={`transfer-${account.id}`} value={transferPayeeLabel(account.name)} />
          ))}
        </datalist>

        <div
          className={`hidden gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600 md:grid ${gridCols}`}
        >
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              disabled={rows.length === 0}
              aria-label="Select all transactions"
              className="h-4 w-4 rounded-sm border-neutral-300 text-brand-700 focus:ring-brand-700"
            />
          </div>
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
            accountOnBudget={accountOnBudget}
            categoryGroups={categoryGroups}
            payeeNames={payeeNames}
            payeeLastCategory={payeeLastCategory}
            transferAccounts={transferAccounts}
            findTransferLinkCandidates={findTransferLinkCandidates}
            createTransaction={createTransaction}
            gridCols={gridCols}
            currency={currency}
            onClose={() => setAddingNew(false)}
          />
        )}

        {rows.map((t) => {
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
                payeeNames={payeeNames}
                payeeLastCategory={payeeLastCategory}
                transferAccounts={transferAccounts}
                findTransferLinkCandidates={findTransferLinkCandidates}
                updateTransaction={updateTransaction}
                deleteTransaction={deleteTransaction}
                reconcileTransaction={reconcileTransaction}
                unreconcileTransaction={unreconcileTransaction}
                showAccount={showAccount}
                gridCols={gridCols}
                currency={currency}
                selected={selectedIds.has(t.id)}
                onToggleSelected={() => toggleSelected(t.id)}
                selectionDisabled={bulkDeletePending}
              />
            </Fragment>
          );
        })}

        {rows.length === 0 && (
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
            Showing {rows.length} of {totalCount} transaction
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
  const { run, pending, error } = useServerAction(
    reconciliation?.reconcileAccount ?? (async () => {}),
  );

  if (!reconciliation || reconciliation.statementAmount === null) return null;

  const { accountId, statementAmount, cancelReconciling } = reconciliation;
  const gap = statementAmount - balance;
  const matched = gap === 0;

  async function handleReconcile() {
    try {
      await run({ accountId });
      cancelReconciling();
    } catch {
      // error is surfaced via `error` below
    }
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
            className="rounded-sm bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {pending ? "Reconciling…" : "Reconcile"}
          </button>
        )}
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="rounded-sm px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="w-full text-small text-danger">{error}</p>}
    </div>
  );
}

// fallow-ignore-next-line complexity
function TransactionRow({
  transaction,
  categoryGroups,
  payeeNames,
  payeeLastCategory,
  transferAccounts,
  findTransferLinkCandidates,
  updateTransaction,
  deleteTransaction,
  reconcileTransaction,
  unreconcileTransaction,
  showAccount,
  gridCols,
  currency,
  selected,
  onToggleSelected,
  selectionDisabled,
}: {
  transaction: TransactionRowData;
  categoryGroups: GroupOption[];
  payeeNames: string[];
  payeeLastCategory: Record<string, string>;
  transferAccounts: TransferAccountOption[];
  findTransferLinkCandidates: (formData: FormData) => Promise<TransferLinkCandidate[]>;
  updateTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (formData: FormData) => Promise<void>;
  reconcileTransaction: (formData: FormData) => Promise<void>;
  unreconcileTransaction: (formData: FormData) => Promise<void>;
  // Bulk-select checkbox state (#41), lifted up to TransactionsTable so a
  // selection survives this row re-rendering (e.g. while it's mid-edit).
  selected: boolean;
  onToggleSelected: () => void;
  selectionDisabled: boolean;
  showAccount: boolean;
  gridCols: string;
  currency: string;
}) {
  const updateAction = useServerAction(updateTransaction);
  const deleteAction = useServerAction(deleteTransaction);
  const reconcileAction = useServerAction(reconcileTransaction);
  const unreconcileAction = useServerAction(unreconcileTransaction);
  const linkAction = useServerAction(findTransferLinkCandidates);
  const pending =
    updateAction.pending ||
    deleteAction.pending ||
    reconcileAction.pending ||
    unreconcileAction.pending ||
    linkAction.pending;
  const error =
    updateAction.error ||
    deleteAction.error ||
    reconcileAction.error ||
    unreconcileAction.error ||
    linkAction.error;

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
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    position: menuPosition,
    triggerRef: menuButtonRef,
    panelRef: menuRef,
  } = usePopover({
    width: 160, // matches the menu's w-40
    align: "right",
  });

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

  const currentTransfer: TransferAccountOption | null = transaction.transferAccountId
    ? {
        id: transaction.transferAccountId,
        name: transaction.transferAccountName,
        onBudget: transaction.transferAccountOnBudget ?? false,
      }
    : null;

  function selectedTransfer(payeeName: string) {
    return matchingTransferAccount(
      payeeName,
      transferAccounts,
      transaction.accountId,
      currentTransfer,
    );
  }

  function handlePayeeChange(name: string) {
    setDraft((d) => {
      const next = applyPayeeChange(d, name, payeeLastCategory);
      const transfer = selectedTransfer(name);
      if (!transfer) return next;
      if (transferCategoryPlacement(transaction.accountOnBudget, transfer.onBudget) === "none") {
        return { ...next, categoryId: "" };
      }
      return next;
    });
  }

  function handleCancel() {
    setDraft(committed);
  }

  function saveDeclined(transfer: TransferAccountOption | null): boolean {
    const reconciled = declined(reconcilePrompt(transaction.cleared, transaction.counterpartCleared));
    if (reconciled) return true;
    return declined(unlinkPrompt(transaction.transferAccountName, Boolean(transfer)));
  }

  async function editedFields(transfer: TransferAccountOption | null) {
    const linkTransactionId = await offerToLink(
      linkAction.run,
      linkTarget(transfer, transaction.transferAccountId),
      {
        sourceAccountId: transaction.accountId,
        date: draft.date,
        amount: String(draftAmountInput(draft)),
        excludeTransactionId: transaction.id,
      },
    );
    return {
      transactionId: transaction.id,
      date: draft.date,
      payeeName: draft.payeeName,
      categoryId: draft.categoryId,
      memo: draft.memo,
      amount: String(draftAmountInput(draft)),
      transferAccountId: accountIdOf(transfer),
      linkTransactionId,
      confirmUnlink: confirmUnlinkValue(transaction.transferAccountId, transfer),
    };
  }

  async function handleSubmit() {
    const transfer = selectedTransfer(draft.payeeName);
    if (saveDeclined(transfer)) return;
    try {
      await updateAction.run(await editedFields(transfer));
      setCommitted(draft);
      setExpanded(false);
    } catch {
      // error is surfaced via updateAction.error
    }
  }

  async function handleDelete() {
    setMenuOpen(false);
    const message = transaction.transferAccountName
      ? `Delete this transfer? The matching transaction in ${transaction.transferAccountName} will be deleted too. This can't be undone.`
      : "Delete this transaction? This can't be undone.";
    if (!window.confirm(message)) {
      return;
    }
    try {
      await deleteAction.run({ transactionId: transaction.id });
    } catch {
      // error is surfaced via deleteAction.error
    }
  }

  async function handleReconcile() {
    if (!window.confirm("Mark this transaction as reconciled?")) {
      return;
    }
    try {
      await reconcileAction.run({ transactionId: transaction.id });
    } catch {
      // error is surfaced via reconcileAction.error
    }
  }

  async function handleUnreconcile() {
    if (
      !window.confirm(
        "Un-reconcile this transaction? It will no longer count as reconciled.",
      )
    ) {
      return;
    }
    try {
      await unreconcileAction.run({ transactionId: transaction.id });
    } catch {
      // error is surfaced via unreconcileAction.error
    }
  }

  const categoryName = categoryNameFor(categoryGroups, committed.categoryId);
  const draftTransfer = selectedTransfer(draft.payeeName);
  const categoryState = categoryEditorState({
    isStartingBalance: transaction.payeeName === STARTING_BALANCE_PAYEE,
    accountOnBudget: transaction.accountOnBudget,
    transfer: draftTransfer,
    existingTransfer: Boolean(transaction.transferAccountId),
    categoryGroups,
    counterpartCategoryId: transaction.counterpartCategoryId,
  });
  const summaryAmount = amountFromDraft(committed);
  const summaryCategory = transaction.transferAccountId
    ? (categoryName ?? "No category")
    : (categoryName ?? "Uncategorized");
  const isReconciled = transaction.cleared === "RECONCILED";

  return (
    <div
      className={
        "border-b border-neutral-100 text-body last:border-b-0 " +
        (isDirty ? "bg-brand-700/5" : "")
      }
    >
      {error && (
        <p className="bg-danger/10 px-200 py-1 text-small text-danger">
          {error}
        </p>
      )}
      {/* Mobile-only: a compact summary row (payee, category pill, amount)
          you tap to open the editor below - the desktop table never shows
          this, it always renders the editor as a normal row instead. The
          bulk-select checkbox (#41) sits outside the tap target itself
          (input can't nest inside a button) with its own click handler so
          checking it doesn't also expand the row. */}
      <div
        className={
          (expanded ? "hidden " : "flex ") +
          "w-full items-start gap-2 px-200 py-3 md:hidden"
        }
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          disabled={selectionDisabled}
          aria-label="Select transaction"
          className="mt-1 h-4 w-4 shrink-0 rounded-sm border-neutral-300 text-brand-700 focus:ring-brand-700"
        />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex flex-1 items-start justify-between gap-3 text-left"
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
              {summaryCategory}
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
              <div className="mt-0.5 max-w-40 truncate text-small text-neutral-600">
                {transaction.accountName}
              </div>
            )}
          </div>
        </button>
      </div>

      <div
        className={
          (expanded ? "grid " : "hidden ") +
          `grid-cols-2 gap-x-3 gap-y-2 px-200 py-3 md:grid md:items-center md:gap-2 md:py-1 ${gridCols}`
        }
      >
        {/* Desktop-only: the bulk-select checkbox (#41) - on mobile,
            selection happens from the collapsed summary row above instead,
            so this stays hidden there rather than duplicating it. */}
        <div className="hidden md:flex md:items-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            disabled={selectionDisabled}
            aria-label="Select transaction"
            className="h-4 w-4 rounded-sm border-neutral-300 text-brand-700 focus:ring-brand-700"
          />
        </div>

        {/* Mobile-only: collapse back to the summary row without needing
            to Cancel or Save first. */}
        <div className="col-span-2 -mb-1 flex justify-end md:hidden">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            title="Collapse"
            className="rounded-sm p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <Icon
              name="expand_less"
              label="Collapse"
              className="text-[1.1em]"
            />
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
          <PayeeInput
            value={draft.payeeName}
            accountId={transaction.accountId}
            payeeNames={payeeNames}
            transferAccounts={transferAccounts}
            onChange={handlePayeeChange}
            className={inputClass}
          />
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="mb-1 block text-small text-neutral-600 md:hidden">
            Category
          </label>
          <CategoryOptions
            groups={categoryGroups}
            value={draft.categoryId}
            onChange={(value) => patch({ categoryId: value })}
            disabled={categoryState.disabled}
            disabledLabel={categoryState.disabledLabel}
            disabledTitle={categoryState.disabledTitle}
            className={inputClass}
          />
          {categoryState.hint && (
            <p className="mt-1 text-small text-neutral-600">{categoryState.hint}</p>
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
          {isReconciled ? (
            <button
              type="button"
              onClick={handleUnreconcile}
              disabled={pending}
              title="Un-reconcile"
              className="rounded-sm p-1 text-brand-700 hover:bg-brand-700/10 disabled:opacity-50"
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
              className="rounded-sm p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
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
            className="rounded-sm p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
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

      {/* Cancel/Save get their own strip below the fields while the row is
          dirty, rather than joining reconcile/kebab in the 80px trailing
          column, where four buttons don't fit and spilled left over the
          Outflow input. The strip is right-aligned to the row's edge; on
          mobile it follows the editor's expanded state. */}
      {isDirty && (
        <div
          className={
            (expanded ? "flex " : "hidden ") + "px-200 pb-3 md:flex md:pb-2"
          }
        >
          <div className="flex flex-1 justify-end gap-1">
            <button
              type="button"
              onClick={handleCancel}
              disabled={pending}
              title="Cancel"
              className="rounded-sm px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              title="Save"
              className="rounded-sm bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {pending ? "…" : "Save"}
            </button>
          </div>
        </div>
      )}
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
// fallow-ignore-next-line complexity
function NewTransactionRow({
  accountId,
  accountOnBudget,
  categoryGroups,
  payeeNames,
  payeeLastCategory,
  transferAccounts,
  findTransferLinkCandidates,
  createTransaction,
  gridCols,
  currency,
  onClose,
}: {
  accountId: string;
  accountOnBudget: boolean;
  categoryGroups: GroupOption[];
  payeeNames: string[];
  payeeLastCategory: Record<string, string>;
  transferAccounts: TransferAccountOption[];
  findTransferLinkCandidates: (formData: FormData) => Promise<TransferLinkCandidate[]>;
  createTransaction: (formData: FormData) => Promise<void>;
  gridCols: string;
  currency: string;
  onClose: () => void;
}) {
  const createAction = useServerAction(createTransaction);
  const linkAction = useServerAction(findTransferLinkCandidates);
  const pending = createAction.pending || linkAction.pending;
  const error = createAction.error || linkAction.error;
  const [draft, setDraft] = useState<Draft>(blankDraft);

  function patch(fields: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...fields }));
  }

  function handlePayeeChange(name: string) {
    setDraft((d) => {
      const next = applyPayeeChange(d, name, payeeLastCategory);
      const transfer = matchingTransferAccount(name, transferAccounts, accountId, null);
      if (transfer && transferCategoryPlacement(accountOnBudget, transfer.onBudget) === "none") {
        return { ...next, categoryId: "" };
      }
      return next;
    });
  }

  async function fieldsFromDraft() {
    const transfer = matchingTransferAccount(draft.payeeName, transferAccounts, accountId, null);
    const linkTransactionId = await offerToLink(linkAction.run, transfer, {
      sourceAccountId: accountId,
      date: draft.date,
      amount: String(draftAmountInput(draft)),
    });
    return {
      accountId,
      date: draft.date,
      payeeName: draft.payeeName,
      categoryId: draft.categoryId,
      memo: draft.memo,
      amount: String(draftAmountInput(draft)),
      transferAccountId: transfer?.id ?? "",
      linkTransactionId,
    };
  }

  async function handleSave() {
    try {
      await createAction.run(await fieldsFromDraft());
      onClose();
    } catch {
      // error is surfaced via `error` below
    }
  }

  async function handleSaveAndAddAnother() {
    try {
      await createAction.run(await fieldsFromDraft());
      setDraft(blankDraft());
    } catch {
      // error is surfaced via `error` below
    }
  }

  const draftTransfer = matchingTransferAccount(draft.payeeName, transferAccounts, accountId, null);
  const categoryState = categoryEditorState({
    isStartingBalance: false,
    accountOnBudget,
    transfer: draftTransfer,
    existingTransfer: false,
    categoryGroups,
    counterpartCategoryId: null,
  });

  return (
    <div className="border-b border-neutral-100 bg-brand-700/5 text-body">
      {error && (
        <p className="bg-danger/10 px-200 py-1 text-small text-danger">
          {error}
        </p>
      )}
      <div
        className={`grid grid-cols-2 gap-x-3 gap-y-2 px-200 py-3 md:grid md:items-center md:gap-2 md:py-1 ${gridCols}`}
      >
        {/* Desktop-only placeholder for the bulk-select checkbox column
            (#41) - a blank, uncommitted row can't be selected, but still
            needs to occupy that column so the fields below line up with
            the rest of the table. */}
        <div className="hidden md:block" />

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
          <PayeeInput
            value={draft.payeeName}
            accountId={accountId}
            payeeNames={payeeNames}
            transferAccounts={transferAccounts}
            onChange={handlePayeeChange}
            className={inputClass}
          />
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="mb-1 block text-small text-neutral-600 md:hidden">
            Category
          </label>
          <CategoryOptions
            groups={categoryGroups}
            value={draft.categoryId}
            onChange={(value) => patch({ categoryId: value })}
            disabled={categoryState.disabled}
            disabledLabel={categoryState.disabledLabel}
            disabledTitle={categoryState.disabledTitle}
            className={inputClass}
          />
          {categoryState.hint && (
            <p className="mt-1 text-small text-neutral-600">{categoryState.hint}</p>
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
      </div>

      {/* Actions get their own row below the input fields rather than
          squeezing into the table's narrow trailing column - unlike
          TransactionRow's icon-only actions, "Save and add another" needs
          the room. On desktop this row reuses gridCols and spans every
          field column but the last (`col-[1/-2]`) so the button
          group's right edge lines up with Outflow's above it, instead of
          drifting into the trailing column TransactionRow reserves for its
          icon actions - which this row leaves empty. */}
      <div
        className={`flex border-t border-neutral-100 px-200 pb-3 pt-2 md:grid md:items-center md:gap-2 md:pb-2 md:pt-1 ${gridCols}`}
      >
        <div className="flex flex-1 flex-wrap justify-end gap-1 md:flex-none md:col-[1/-2]">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            title="Cancel"
            className="rounded-sm px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveAndAddAnother}
            disabled={pending}
            title="Save and add another"
            className="rounded-sm border border-brand-700 px-2 py-1 text-small font-medium text-brand-700 hover:bg-brand-700/10 disabled:opacity-50"
          >
            {pending ? "…" : "Save and add another"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            title="Save"
            className="rounded-sm bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {pending ? "…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

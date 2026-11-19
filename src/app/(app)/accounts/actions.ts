"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { getCurrentUser } from "@/lib/auth";
import {
  accessibleBudgetWhere,
  requireAccountAccess,
  requireBudgetAccess,
  requireTransactionAccess,
} from "@/lib/authorization";
import {
  auditedCreate,
  auditedUpdate,
  diffFields,
  recordAuditEntries,
} from "@/lib/audit";
import { numberToMilliunits } from "@/lib/money";
import { readNewTransaction } from "@/lib/newTransaction";
import {
  ACCOUNT_TYPES,
  accountTypeChangeError,
  isDebtAccountType,
  type AccountType,
} from "@/lib/accountTypes";
import { applyBalanceDelta, findOrCreatePayee } from "./ledger";
import { STARTING_BALANCE_PAYEE } from "@/lib/payees";
import { assertCategoryUsable, readyToAssignCategoryId } from "@/lib/systemCategories";
import { ensurePaymentCategory, startingBalanceCategoryId, syncPaymentCategory } from "@/lib/paymentCategories";
import {
  TRANSFER_LINK_WINDOW_DAYS,
  onBudgetChangeError,
  selectLinkCandidates,
  transferAccountNameFromPayee,
  type TransferLinkCandidate,
} from "@/lib/transfers";
import { applyTransferEdit, deleteTransferRows, startTransfer, type DeletableTransaction } from "./transferWrite";

/**
 * The revalidatePath tail every account/transaction mutation below ends
 * with (#47) — consolidated so a new action can't forget one of the paths
 * a stale cache would otherwise leave behind. `accountIds` also
 * revalidates each account's own page; `budget` defaults to true since
 * most mutations here can move category balances too — the reconcile
 * actions (which only flip `cleared`, not `balance`) opt out.
 */
function revalidateAccountPaths(
  accountIds: string | string[] = [],
  { budget = true }: { budget?: boolean } = {},
): void {
  for (const id of Array.isArray(accountIds) ? accountIds : [accountIds]) {
    revalidatePath(`/accounts/${id}`);
  }
  revalidatePath("/accounts/all");
  revalidatePath("/accounts");
  if (budget) revalidatePath("/budget");
}

/**
 * Creates a new account, always seeding it with a Starting Balance
 * transaction (amount 0 by default, dated today) so the opening balance is
 * never just a bare number with no transaction behind it.
 *
 * Returns the new account's id so the caller can navigate to it (#195).
 * Validation errors still throw, before anything is written.
 */
export async function createAccount(
  formData: FormData,
): Promise<{ id: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const typeInput = String(formData.get("type") ?? "CHECKING");
  const balanceInput = String(formData.get("balance") ?? "0");

  if (!name) {
    throw new Error("Account name is required");
  }

  const type = ACCOUNT_TYPES.includes(typeInput as AccountType)
    ? (typeInput as AccountType)
    : "CHECKING";

  const balance = numberToMilliunits(Number(balanceInput) || 0);
  const budget = await getCurrentBudget();
  const user = await getCurrentUser();
  // Cards and lines of credit default to on-budget (ADR 0010). Every other
  // type already did.
  const onBudget = true;

  const accountId = await prisma.$transaction(async (tx) => {
    const account = await auditedCreate({
      tx,
      budgetId: budget.id,
      entityType: "ACCOUNT",
      actorId: user.id,
      apply: () =>
        tx.account.create({
          data: { budgetId: budget.id, name, type, balance, onBudget },
        }),
      entityId: (a) => a.id,
      fields: () => ({ name, type, balance, onBudget }),
    });

    // The starting balance (even 0) is recorded as a real transaction (the
    // same "Starting Balance" convention YNAB itself uses) so the
    // account's transaction list always sums to its balance, and a new
    // account always has a row whose amount and date can be edited.
    const payeeId = await findOrCreatePayee(
      tx,
      budget.id,
      STARTING_BALANCE_PAYEE,
      user.id,
    );
    // An on-budget Starting Balance is Ready to Assign income (ADR 0008),
    // except a negative card balance, which stays uncategorized and outside
    // the budget (ADR 0010).
    const categoryId =
      isDebtAccountType(type) && balance < 0
        ? null
        : startingBalanceCategoryId(type, balance, await readyToAssignCategoryId(tx, budget.id));

    await auditedCreate({
      tx,
      budgetId: budget.id,
      entityType: "TRANSACTION",
      actorId: user.id,
      apply: () =>
        tx.transaction.create({
          data: {
            accountId: account.id,
            payeeId,
            categoryId,
            date: new Date(),
            amount: balance,
            memo: "Starting balance",
            cleared: "RECONCILED",
          },
        }),
      entityId: (t) => t.id,
      fields: (t) => ({
        accountId: account.id,
        payeeId,
        categoryId,
        date: t.date,
        amount: balance,
        memo: "Starting balance",
      }),
    });

    if (isDebtAccountType(type)) {
      await ensurePaymentCategory(tx, {
        budgetId: budget.id,
        actorId: user.id,
        account: { id: account.id, name, closed: false },
      });
    }

    return account.id;
  });

  revalidateAccountPaths();
  return { id: accountId };
}

/**
 * Creates a new transaction on an account (#34) - the manual counterpart to
 * createAccount's "Starting Balance" row. Same shape as the fields
 * updateTransaction accepts (date/payeeName/categoryId/memo/amount), but all
 * required up front since there's no existing row to fall back on, and it
 * always increments the owning account's cached `balance` by the full
 * entered amount rather than a before/after delta.
 */
async function saveNewTransfer(
  actorId: string,
  budgetId: string,
  input: ReturnType<typeof readNewTransaction>,
) {
  const { accountIds } = await prisma.$transaction((tx) =>
    startTransfer(tx, {
      budgetId,
      actorId,
      sourceAccountId: input.accountId,
      transferAccountId: input.transferAccountId,
      payeeName: input.payeeName,
      fields: { date: input.date, amount: input.amount, memo: input.memo },
      enteredCategoryId: input.categoryId,
      linkTransactionId: input.linkTransactionId,
    }),
  );
  revalidateAccountPaths(accountIds);
}

async function saveOrdinaryTransaction(
  actorId: string,
  budgetId: string,
  input: ReturnType<typeof readNewTransaction>,
) {
  await prisma.$transaction(async (tx) => {
    await assertCategoryUsable(tx, input.categoryId, { budgetId, accountId: input.accountId });
    const payeeId = input.payeeName
      ? await findOrCreatePayee(tx, budgetId, input.payeeName, actorId)
      : null;
    await auditedCreate({
      tx,
      budgetId,
      entityType: "TRANSACTION",
      actorId,
      apply: () =>
        tx.transaction.create({
          data: {
            accountId: input.accountId,
            payeeId,
            categoryId: input.categoryId,
            date: input.date,
            amount: input.amount,
            memo: input.memo,
          },
        }),
      entityId: (transaction) => transaction.id,
      fields: () => ({
        accountId: input.accountId,
        payeeId,
        categoryId: input.categoryId,
        date: input.date,
        amount: input.amount,
        memo: input.memo,
      }),
    });
    await applyBalanceDelta(tx, input.accountId, input.amount);
  });
  revalidateAccountPaths(input.accountId);
}

export async function createTransaction(formData: FormData) {
  const input = readNewTransaction(formData);
  const { user, budgetId } = await requireAccountAccess(input.accountId);
  const asTransfer = input.transferAccountId || transferAccountNameFromPayee(input.payeeName);
  if (asTransfer) {
    await saveNewTransfer(user.id, budgetId, input);
    return;
  }
  await saveOrdinaryTransaction(user.id, budgetId, input);
}

export type ImportRow = {
  date: string; // ISO "yyyy-mm-dd"
  payeeName: string;
  memo: string;
  amount: number; // dollars, sign included - same convention createTransaction's "amount" field uses
};

/**
 * Flags which rows of a File Import (#35) look like duplicates of
 * transactions already on the account - same date + amount + payee - so
 * the preview step can warn before anything is written. Advisory only:
 * returns one boolean per row (same order as `rows`), the caller decides
 * whether to still include a flagged row.
 *
 * Existing transactions are fetched once for the whole date range the
 * import covers, rather than one query per row, since a typical bank
 * export is tens to hundreds of rows. A linked transfer row counts as an
 * existing row (ADR 0007): this query doesn't skip them.
 */
export async function checkImportDuplicates(
  formData: FormData,
): Promise<boolean[]> {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) {
    throw new Error("accountId is required");
  }
  await requireAccountAccess(accountId);

  const rows: ImportRow[] = JSON.parse(String(formData.get("rows") ?? "[]"));
  if (rows.length === 0) {
    return [];
  }

  const times = rows.map((r) => new Date(r.date).getTime());
  const existing = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: new Date(Math.min(...times)), lte: new Date(Math.max(...times)) },
    },
    select: { date: true, amount: true, payee: { select: { name: true } } },
  });

  const dupeKey = (date: string, amount: number, payeeName: string) =>
    `${date}|${amount}|${payeeName.trim().toLowerCase()}`;

  const existingKeys = new Set(
    existing.map((t) =>
      dupeKey(t.date.toISOString().slice(0, 10), t.amount, t.payee?.name ?? ""),
    ),
  );

  return rows.map((row) =>
    existingKeys.has(
      dupeKey(row.date, numberToMilliunits(row.amount), row.payeeName),
    ),
  );
}

/**
 * Unlinked rows in another account that match a transfer being entered:
 * the opposite amount, within a few days (see TRANSFER_LINK_WINDOW_DAYS).
 * The editor offers to link one of these instead of creating a duplicate.
 */
export async function findTransferLinkCandidates(
  formData: FormData,
): Promise<TransferLinkCandidate[]> {
  const otherAccountId = String(formData.get("accountId") ?? "");
  if (!otherAccountId) throw new Error("accountId is required");
  const { budgetId } = await requireAccountAccess(otherAccountId);

  const sourceAccountId = String(formData.get("sourceAccountId") ?? "");
  if (sourceAccountId) {
    const source = await prisma.account.findUnique({
      where: { id: sourceAccountId },
      select: { budgetId: true },
    });
    if (!source || source.budgetId !== budgetId) throw new Error("Account not found");
  }

  const dateInput = String(formData.get("date") ?? "");
  if (!dateInput) throw new Error("Date is required");
  const date = new Date(dateInput);
  const amount = numberToMilliunits(Number(formData.get("amount")) || 0);
  const excludeId = String(formData.get("excludeTransactionId") ?? "") || undefined;
  const windowMs = (TRANSFER_LINK_WINDOW_DAYS + 1) * 86_400_000;

  const rows = await prisma.transaction.findMany({
    where: {
      accountId: otherAccountId,
      transferTransactionId: null,
      amount: -amount,
      date: {
        gte: new Date(date.getTime() - windowMs),
        lte: new Date(date.getTime() + windowMs),
      },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      date: true,
      amount: true,
      memo: true,
      transferTransactionId: true,
      payee: { select: { name: true } },
    },
  });

  return selectLinkCandidates(
    rows.map((row) => ({ ...row, payeeName: row.payee?.name ?? null })),
    { amount, date, excludeId },
  ).map((row) => ({
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    amount: row.amount,
    memo: row.memo,
  }));
}

/**
 * Bulk-creates transactions from a parsed, column-mapped import file (#35) -
 * the File Import counterpart to createTransaction's one-at-a-time entry.
 * Every row is created (reusing payees the same way createTransaction does)
 * and the account's cached `balance` is incremented once by the rows'
 * total, all inside one prisma.$transaction so a failure partway through a
 * large file can't leave the account half-imported.
 */
export async function importTransactions(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) {
    throw new Error("accountId is required");
  }

  const rows: ImportRow[] = JSON.parse(String(formData.get("rows") ?? "[]"));
  if (rows.length === 0) {
    return;
  }

  const { user, budgetId } = await requireAccountAccess(accountId);

  await prisma.$transaction(async (tx) => {
    // Payees repeat heavily within one import file (the same merchant over
    // many rows), so cache find-or-create results per name for the length
    // of this loop rather than hitting findOrCreatePayee - and the
    // database - once per row.
    const payeeIds = new Map<string, string>();
    let total = 0;
    const auditEntries = [];

    for (const row of rows) {
      const amount = numberToMilliunits(row.amount);
      const payeeName = row.payeeName.trim();
      const date = new Date(row.date);
      const memo = row.memo.trim() || null;

      let payeeId: string | null = null;
      if (payeeName) {
        const cacheKey = payeeName.toLowerCase();
        payeeId = payeeIds.get(cacheKey) ?? null;
        if (!payeeId) {
          payeeId = await findOrCreatePayee(tx, budgetId, payeeName, user.id);
          payeeIds.set(cacheKey, payeeId);
        }
      }

      const transaction = await tx.transaction.create({
        data: {
          accountId,
          payeeId,
          date,
          amount,
          memo,
        },
      });
      auditEntries.push({
        budgetId,
        entityType: "TRANSACTION" as const,
        entityId: transaction.id,
        action: "created",
        actorId: user.id,
        changes: diffFields({}, { accountId, payeeId, date, amount, memo }),
      });
      total += amount;
    }

    await recordAuditEntries(tx, auditEntries);
    await applyBalanceDelta(tx, accountId, total);
  });

  revalidateAccountPaths(accountId);
}

/**
 * Updates one or more fields of a transaction. Each editable cell in a
 * transaction table (single-account or all-accounts) commits
 * independently — only the fields present in `formData` are touched,
 * everything else is left as-is.
 *
 * `amount` (in dollars, sign included — Inflow commits it positive,
 * Outflow commits it negated) keeps the owning account's cached `balance`
 * in sync by the delta between the old and new amount.
 */
function optionalDate(formData: FormData): Date | undefined {
  if (!formData.has("date")) return undefined;
  const dateInput = String(formData.get("date") ?? "");
  if (!dateInput) throw new Error("Date is required");
  return new Date(dateInput);
}

function optionalTrimmed(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  return String(formData.get(key) ?? "").trim() || null;
}

function optionalAmount(formData: FormData): number | undefined {
  if (!formData.has("amount")) return undefined;
  return numberToMilliunits(Number(formData.get("amount")) || 0);
}

function readTransactionPatch(formData: FormData) {
  return {
    date: optionalDate(formData),
    categoryId: optionalTrimmed(formData, "categoryId"),
    memo: optionalTrimmed(formData, "memo"),
    amount: optionalAmount(formData),
    payeeName: formData.has("payeeName")
      ? String(formData.get("payeeName") ?? "").trim()
      : undefined,
    transferAccountId: formData.has("transferAccountId")
      ? String(formData.get("transferAccountId") ?? "") || null
      : null,
  };
}

function transferEditRequested(
  transferTransactionId: string | null,
  patch: ReturnType<typeof readTransactionPatch>,
): boolean {
  if (transferTransactionId) return true;
  if (patch.transferAccountId) return true;
  return Boolean(patch.payeeName && transferAccountNameFromPayee(patch.payeeName));
}

function ordinaryPatchTouches(patch: ReturnType<typeof readTransactionPatch>): boolean {
  return (
    patch.payeeName !== undefined ||
    patch.date !== undefined ||
    patch.categoryId !== undefined ||
    patch.memo !== undefined ||
    patch.amount !== undefined
  );
}

async function saveTransferEdit(
  actorId: string,
  transaction: { account: { budgetId: string } },
  transactionId: string,
  patch: ReturnType<typeof readTransactionPatch>,
  formData: FormData,
) {
  const { accountIds } = await prisma.$transaction((tx) =>
    applyTransferEdit(tx, {
      budgetId: transaction.account.budgetId,
      actorId,
      sourceId: transactionId,
      fields: {
        date: patch.date,
        amount: patch.amount,
        memo: patch.memo,
        categoryId: patch.categoryId,
        payeeName: patch.payeeName,
      },
      transferAccountId: patch.transferAccountId,
      confirmUnlink: formData.get("confirmUnlink") === "true",
      linkTransactionId: String(formData.get("linkTransactionId") ?? "") || null,
    }),
  );
  revalidateAccountPaths(accountIds);
}

async function categoryIfChanged(
  tx: Parameters<typeof assertCategoryUsable>[0],
  next: string | null | undefined,
  transaction: { categoryId: string | null; accountId: string; account: { budgetId: string } },
) {
  if (next === undefined || next === transaction.categoryId) return;
  await assertCategoryUsable(tx, next, {
    budgetId: transaction.account.budgetId,
    accountId: transaction.accountId,
  });
}

// A new payee is created inside the same transaction as the row update, so a
// failed update doesn't leave the payee behind. Two concurrent requests can
// still each create a duplicate for a brand-new name: Payee has no unique
// (budgetId, name) constraint.
async function payeeIdForUpdate(
  tx: Parameters<typeof findOrCreatePayee>[0],
  budgetId: string,
  actorId: string,
  payeeName: string | undefined,
): Promise<string | null | undefined> {
  if (payeeName === undefined) return undefined;
  if (!payeeName) return null;
  return findOrCreatePayee(tx, budgetId, payeeName, actorId);
}

function definedFields(entries: [string, unknown][]): Record<string, unknown> {
  return Object.fromEntries(entries.filter((entry) => entry[1] !== undefined));
}

async function saveOrdinaryEdit(
  actorId: string,
  transaction: {
    accountId: string;
    amount: number;
    date: Date;
    payeeId: string | null;
    categoryId: string | null;
    memo: string | null;
    account: { budgetId: string };
  },
  transactionId: string,
  patch: ReturnType<typeof readTransactionPatch>,
) {
  await prisma.$transaction(async (tx) => {
    await categoryIfChanged(tx, patch.categoryId, transaction);
    const payeeId = await payeeIdForUpdate(
      tx,
      transaction.account.budgetId,
      actorId,
      patch.payeeName,
    );
    const data = definedFields([
      ["date", patch.date],
      ["categoryId", patch.categoryId],
      ["memo", patch.memo],
      ["amount", patch.amount],
      ["payeeId", payeeId],
    ]);
    await auditedUpdate({
      tx,
      budgetId: transaction.account.budgetId,
      entityType: "TRANSACTION",
      entityId: transactionId,
      actorId,
      before: {
        date: transaction.date,
        payeeId: transaction.payeeId,
        categoryId: transaction.categoryId,
        memo: transaction.memo,
        amount: transaction.amount,
      },
      after: data,
      apply: () => tx.transaction.update({ where: { id: transactionId }, data }),
    });
    if (patch.amount !== undefined && patch.amount !== transaction.amount) {
      await applyBalanceDelta(tx, transaction.accountId, patch.amount - transaction.amount);
    }
  });
  revalidateAccountPaths(transaction.accountId);
}

export async function updateTransaction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) {
    throw new Error("transactionId is required");
  }

  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: {
      accountId: true,
      amount: true,
      date: true,
      payeeId: true,
      categoryId: true,
      memo: true,
      transferTransactionId: true,
      account: { select: { budgetId: true } },
    },
  });
  const { user } = await requireBudgetAccess(transaction.account.budgetId);

  const patch = readTransactionPatch(formData);
  if (transferEditRequested(transaction.transferTransactionId, patch)) {
    await saveTransferEdit(user.id, transaction, transactionId, patch, formData);
    return;
  }
  if (!ordinaryPatchTouches(patch)) return;
  await saveOrdinaryEdit(user.id, transaction, transactionId, patch);
}

/**
 * Deletes a transaction outright and backs its amount out of the owning
 * account's cached `balance` — the inverse of the balance bookkeeping in
 * updateTransaction/createAccount.
 */
export async function deleteTransaction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) {
    throw new Error("transactionId is required");
  }

  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: {
      accountId: true,
      amount: true,
      date: true,
      payeeId: true,
      categoryId: true,
      memo: true,
      transferTransactionId: true,
      account: { select: { budgetId: true } },
    },
  });
  const { user } = await requireBudgetAccess(transaction.account.budgetId);

  const rows: DeletableTransaction[] = [
    {
      id: transactionId,
      accountId: transaction.accountId,
      budgetId: transaction.account.budgetId,
      payeeId: transaction.payeeId,
      categoryId: transaction.categoryId,
      date: transaction.date,
      amount: transaction.amount,
      memo: transaction.memo,
      transferTransactionId: transaction.transferTransactionId,
      payeeName: null,
    },
  ];
  // Deleting either side of a transfer deletes both (ADR 0007).
  if (transaction.transferTransactionId) {
    const other = await prisma.transaction.findUnique({
      where: { id: transaction.transferTransactionId },
      select: {
        id: true,
        accountId: true,
        amount: true,
        date: true,
        payeeId: true,
        categoryId: true,
        memo: true,
        transferTransactionId: true,
        account: { select: { budgetId: true } },
      },
    });
    if (!other || other.account.budgetId !== transaction.account.budgetId) {
      throw new Error("Transaction not found");
    }
    rows.push({
      id: other.id,
      accountId: other.accountId,
      budgetId: other.account.budgetId,
      payeeId: other.payeeId,
      categoryId: other.categoryId,
      date: other.date,
      amount: other.amount,
      memo: other.memo,
      transferTransactionId: other.transferTransactionId,
      payeeName: null,
    });
  }

  const accountIds = await prisma.$transaction((tx) => deleteTransferRows(tx, user.id, rows));
  revalidateAccountPaths(accountIds);
}

/**
 * Deletes several transactions at once (#41) - the multi-select counterpart
 * to deleteTransaction, backing this action for the table's "Delete N
 * selected" bulk action. Transactions can span more than one account on the
 * /accounts/all view. A selected transfer also deletes its other side, even
 * when that row wasn't selected (ADR 0007). Balance deltas are applied once
 * per deleted row, inside the same prisma.$transaction as the deletes.
 */
export async function deleteTransactions(formData: FormData) {
  const transactionIds: string[] = JSON.parse(
    String(formData.get("transactionIds") ?? "[]"),
  );
  if (transactionIds.length === 0) {
    return;
  }

  // Scoped to budgets this user can access as part of the query itself
  // (rather than fetched-then-checked) — a transactionId from a Budget
  // this user has no access to is silently excluded, the same way an
  // already-nonexistent id already was, rather than throwing and
  // revealing that *something* exists at that id.
  const user = await getCurrentUser();
  const transactions = await prisma.transaction.findMany({
    where: {
      id: { in: transactionIds },
      account: { budget: { deleted: false, ...accessibleBudgetWhere(user.id) } },
    },
    select: {
      id: true,
      accountId: true,
      amount: true,
      date: true,
      payeeId: true,
      categoryId: true,
      memo: true,
      transferTransactionId: true,
      account: { select: { budgetId: true } },
    },
  });

  const selected: DeletableTransaction[] = transactions.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    budgetId: t.account.budgetId,
    payeeId: t.payeeId,
    categoryId: t.categoryId,
    date: t.date,
    amount: t.amount,
    memo: t.memo,
    transferTransactionId: t.transferTransactionId,
    payeeName: null,
  }));
  const known = new Set(selected.map((t) => t.id));
  const counterpartIds = selected
    .map((t) => t.transferTransactionId)
    .filter((id): id is string => id !== null && !known.has(id));
  if (counterpartIds.length > 0) {
    const others = await prisma.transaction.findMany({
      where: {
        id: { in: counterpartIds },
        account: { budget: { deleted: false, ...accessibleBudgetWhere(user.id) } },
      },
      select: {
        id: true,
        accountId: true,
        amount: true,
        date: true,
        payeeId: true,
        categoryId: true,
        memo: true,
        transferTransactionId: true,
        account: { select: { budgetId: true } },
      },
    });
    if (others.length !== counterpartIds.length) throw new Error("Transaction not found");
    for (const t of others) {
      selected.push({
        id: t.id,
        accountId: t.accountId,
        budgetId: t.account.budgetId,
        payeeId: t.payeeId,
        categoryId: t.categoryId,
        date: t.date,
        amount: t.amount,
        memo: t.memo,
        transferTransactionId: t.transferTransactionId,
        payeeName: null,
      });
    }
  }

  const accountIds = await prisma.$transaction((tx) => deleteTransferRows(tx, user.id, selected));
  revalidateAccountPaths(accountIds);
}

/**
 * Reconciles an account: every transaction on it whose `cleared` isn't
 * already `"RECONCILED"` is flipped to `"RECONCILED"`. This is the
 * happy-path half of the Reconcile flow (#30) — the caller has already
 * confirmed the account's current `balance` is correct, so there's nothing
 * left to adjust, just the cleared status to stamp. The mismatch/gap
 * tracking path (when the proposed amount is wrong) is a follow-up issue
 * and reuses this same action once the balance is squared up first.
 */
export async function reconcileAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) {
    throw new Error("accountId is required");
  }
  const { user, budgetId } = await requireAccountAccess(accountId);

  await prisma.$transaction(async (tx) => {
    const toReconcile = await tx.transaction.findMany({
      where: { accountId, cleared: { not: "RECONCILED" } },
      select: { id: true, cleared: true },
    });
    if (toReconcile.length === 0) return;

    await tx.transaction.updateMany({
      where: { id: { in: toReconcile.map((t) => t.id) } },
      data: { cleared: "RECONCILED" },
    });
    await recordAuditEntries(
      tx,
      toReconcile.map((t) => ({
        budgetId,
        entityType: "TRANSACTION" as const,
        entityId: t.id,
        action: "updated",
        actorId: user.id,
        changes: diffFields({ cleared: t.cleared }, { cleared: "RECONCILED" }),
      })),
    );
  });

  revalidateAccountPaths(accountId, { budget: false });
}

/**
 * Marks a single transaction `"RECONCILED"` - the per-row counterpart to
 * reconcileAccount's bulk flip, for a transaction the user wants to lock
 * in one at a time rather than reconciling the whole account.
 */
export async function reconcileTransaction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) {
    throw new Error("transactionId is required");
  }

  const { user, budgetId } = await requireTransactionAccess(transactionId);
  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: { accountId: true, cleared: true },
  });

  await prisma.$transaction((tx) =>
    auditedUpdate({
      tx,
      budgetId,
      entityType: "TRANSACTION",
      entityId: transactionId,
      actorId: user.id,
      before: { cleared: transaction.cleared },
      after: { cleared: "RECONCILED" },
      apply: () =>
        tx.transaction.update({
          where: { id: transactionId },
          data: { cleared: "RECONCILED" },
        }),
    }),
  );

  revalidateAccountPaths(transaction.accountId, { budget: false });
}

/**
 * Reverts a single transaction from `"RECONCILED"` back to `"CLEARED"` -
 * the per-row undo for reconcileAccount's bulk flip. Landing on `CLEARED`
 * rather than `UNCLEARED` mirrors YNAB: un-reconciling just unlocks the
 * transaction again, it doesn't forget that it was already matched
 * against the bank.
 */
export async function unreconcileTransaction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) {
    throw new Error("transactionId is required");
  }

  const { user, budgetId } = await requireTransactionAccess(transactionId);
  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: { accountId: true, cleared: true },
  });

  await prisma.$transaction((tx) =>
    auditedUpdate({
      tx,
      budgetId,
      entityType: "TRANSACTION",
      entityId: transactionId,
      actorId: user.id,
      before: { cleared: transaction.cleared },
      after: { cleared: "CLEARED" },
      apply: () =>
        tx.transaction.update({
          where: { id: transactionId },
          data: { cleared: "CLEARED" },
        }),
    }),
  );

  revalidateAccountPaths(transaction.accountId, { budget: false });
}

/**
 * Updates one or more metadata fields of an account (name, type, on-budget,
 * closed) — each editable cell on the Accounts page commits independently,
 * same pattern as updateTransaction. Balance isn't editable here: it's
 * derived from the account's transactions (see createAccount's Starting
 * Balance transaction), not a bare field to overwrite.
 */
function readAccountName(formData: FormData): string | undefined {
  if (!formData.has("name")) return undefined;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Account name is required");
  return name;
}

function readAccountType(formData: FormData): AccountType | undefined {
  if (!formData.has("type")) return undefined;
  const typeInput = String(formData.get("type") ?? "");
  if (!ACCOUNT_TYPES.includes(typeInput as AccountType)) throw new Error("Invalid account type");
  return typeInput as AccountType;
}

function readAccountFields(formData: FormData) {
  return definedFields([
    ["name", readAccountName(formData)],
    ["type", readAccountType(formData)],
    ["onBudget", formData.has("onBudget") ? formData.get("onBudget") === "true" : undefined],
    ["closed", formData.has("closed") ? formData.get("closed") === "true" : undefined],
  ]) as {
    name?: string;
    type?: AccountType;
    onBudget?: boolean;
    closed?: boolean;
  };
}

async function assertOnBudgetStillEditable(
  accountId: string,
  current: boolean,
  next: boolean | undefined,
) {
  if (next === undefined || next === current) return;
  const transactionCount = await prisma.transaction.count({ where: { accountId } });
  const locked = onBudgetChangeError(transactionCount > 0, next, current);
  if (locked) throw new Error(locked);
}

export async function updateAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) throw new Error("accountId is required");
  const { user, budgetId } = await requireAccountAccess(accountId);
  const data = readAccountFields(formData);
  if (Object.keys(data).length === 0) return;

  const before = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { name: true, type: true, onBudget: true, closed: true },
  });
  // A Starting Balance counts (ADR 0007): close the account and open a new one.
  await assertOnBudgetStillEditable(accountId, before.onBudget, data.onBudget);
  if (data.type !== undefined) {
    const transactionCount = await prisma.transaction.count({ where: { accountId } });
    const typeLocked = accountTypeChangeError(transactionCount > 0, data.type, before.type);
    if (typeLocked) throw new Error(typeLocked);
  }
  const after = { ...before, ...data };

  await prisma.$transaction(async (tx) => {
    await auditedUpdate({
      tx,
      budgetId,
      entityType: "ACCOUNT",
      entityId: accountId,
      actorId: user.id,
      before,
      after,
      apply: () => tx.account.update({ where: { id: accountId }, data }),
    });
    await syncPaymentCategory(tx, { budgetId, actorId: user.id, accountId, before, after });
  });

  revalidateAccountPaths(accountId);
}

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
import { auditedUpdate, diffFields, recordAuditEntry, recordAuditEntries } from "@/lib/audit";
import { numberToMilliunits } from "@/lib/money";
import {
  ACCOUNT_TYPES,
  isDebtAccountType,
  type AccountType,
} from "@/lib/accountTypes";
import { applyBalanceDelta, applyBalanceDeltas, findOrCreatePayee } from "./ledger";
import { STARTING_BALANCE_PAYEE } from "@/lib/payees";

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

export async function createAccount(formData: FormData) {
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
  const onBudget = !isDebtAccountType(type);

  await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        budgetId: budget.id,
        name,
        type,
        balance,
        onBudget,
      },
    });
    await recordAuditEntry(tx, {
      budgetId: budget.id,
      entityType: "ACCOUNT",
      entityId: account.id,
      action: "created",
      actorId: user.id,
      changes: diffFields({}, { name, type, balance, onBudget }),
    });

    if (balance !== 0) {
      // A nonzero starting balance is recorded as a real transaction (the
      // same "Starting Balance" convention YNAB itself uses) so the
      // account's transaction list always sums to its balance, instead of
      // showing a balance with nothing behind it.
      const payeeId = await findOrCreatePayee(
        tx,
        budget.id,
        STARTING_BALANCE_PAYEE,
        user.id,
      );

      const startingTransaction = await tx.transaction.create({
        data: {
          accountId: account.id,
          payeeId,
          date: new Date(),
          amount: balance,
          memo: "Starting balance",
          cleared: "RECONCILED",
        },
      });
      await recordAuditEntry(tx, {
        budgetId: budget.id,
        entityType: "TRANSACTION",
        entityId: startingTransaction.id,
        action: "created",
        actorId: user.id,
        changes: diffFields(
          {},
          {
            accountId: account.id,
            payeeId,
            date: startingTransaction.date,
            amount: balance,
            memo: "Starting balance",
          },
        ),
      });
    }
  });

  revalidateAccountPaths();
}

/**
 * Creates a new transaction on an account (#34) - the manual counterpart to
 * createAccount's "Starting Balance" row. Same shape as the fields
 * updateTransaction accepts (date/payeeName/categoryId/memo/amount), but all
 * required up front since there's no existing row to fall back on, and it
 * always increments the owning account's cached `balance` by the full
 * entered amount rather than a before/after delta.
 */
export async function createTransaction(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) {
    throw new Error("accountId is required");
  }

  const dateInput = String(formData.get("date") ?? "");
  if (!dateInput) {
    throw new Error("Date is required");
  }

  const { user, budgetId } = await requireAccountAccess(accountId);

  const payeeName = String(formData.get("payeeName") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;
  const amount = numberToMilliunits(Number(formData.get("amount")) || 0);
  const date = new Date(dateInput);

  await prisma.$transaction(async (tx) => {
    const payeeId = payeeName
      ? await findOrCreatePayee(tx, budgetId, payeeName, user.id)
      : null;

    const transaction = await tx.transaction.create({
      data: {
        accountId,
        payeeId,
        categoryId,
        date,
        amount,
        memo,
      },
    });
    await recordAuditEntry(tx, {
      budgetId,
      entityType: "TRANSACTION",
      entityId: transaction.id,
      action: "created",
      actorId: user.id,
      changes: diffFields({}, { accountId, payeeId, categoryId, date, amount, memo }),
    });

    await applyBalanceDelta(tx, accountId, amount);
  });

  revalidateAccountPaths(accountId);
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
 * export is tens to hundreds of rows.
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
      account: { select: { budgetId: true } },
    },
  });
  const { user } = await requireBudgetAccess(transaction.account.budgetId);

  const data: {
    date?: Date;
    payeeId?: string | null;
    categoryId?: string | null;
    memo?: string | null;
    amount?: number;
  } = {};

  if (formData.has("date")) {
    const dateInput = String(formData.get("date") ?? "");
    if (!dateInput) {
      throw new Error("Date is required");
    }
    data.date = new Date(dateInput);
  }

  // Resolved inside the prisma.$transaction below (via findOrCreatePayee)
  // so the find-or-create and the transaction-row write it feeds commit
  // together as one unit - if the transaction.update fails, the payee it
  // just created isn't left behind orphaned. This doesn't by itself
  // prevent two concurrent requests from each creating a duplicate payee
  // for the same brand-new name (there's no unique constraint on
  // Payee(budgetId, name) to catch that under Postgres's default
  // Read Committed isolation) - that race predates this helper and is
  // unrelated to #47's balance-invariant consolidation.
  const payeeName = formData.has("payeeName")
    ? String(formData.get("payeeName") ?? "").trim()
    : undefined;

  if (formData.has("categoryId")) {
    data.categoryId = String(formData.get("categoryId") ?? "") || null;
  }

  if (formData.has("memo")) {
    data.memo = String(formData.get("memo") ?? "").trim() || null;
  }

  if (formData.has("amount")) {
    data.amount = numberToMilliunits(Number(formData.get("amount")) || 0);
  }

  if (payeeName === undefined && Object.keys(data).length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (payeeName !== undefined) {
      data.payeeId = payeeName
        ? await findOrCreatePayee(tx, transaction.account.budgetId, payeeName, user.id)
        : null;
    }

    await tx.transaction.update({ where: { id: transactionId }, data });
    await recordAuditEntry(tx, {
      budgetId: transaction.account.budgetId,
      entityType: "TRANSACTION",
      entityId: transactionId,
      action: "updated",
      actorId: user.id,
      changes: diffFields(
        {
          date: transaction.date,
          payeeId: transaction.payeeId,
          categoryId: transaction.categoryId,
          memo: transaction.memo,
          amount: transaction.amount,
        },
        data,
      ),
    });

    if (data.amount !== undefined && data.amount !== transaction.amount) {
      await applyBalanceDelta(
        tx,
        transaction.accountId,
        data.amount - transaction.amount,
      );
    }
  });

  revalidateAccountPaths(transaction.accountId);
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
      account: { select: { budgetId: true } },
    },
  });
  const { user } = await requireBudgetAccess(transaction.account.budgetId);

  await prisma.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id: transactionId } });
    await recordAuditEntry(tx, {
      budgetId: transaction.account.budgetId,
      entityType: "TRANSACTION",
      entityId: transactionId,
      action: "deleted",
      actorId: user.id,
      changes: diffFields(
        {
          accountId: transaction.accountId,
          date: transaction.date,
          payeeId: transaction.payeeId,
          categoryId: transaction.categoryId,
          memo: transaction.memo,
          amount: transaction.amount,
        },
        {},
      ),
    });
    await applyBalanceDelta(tx, transaction.accountId, -transaction.amount);
  });

  revalidateAccountPaths(transaction.accountId);
}

/**
 * Deletes several transactions at once (#41) - the multi-select counterpart
 * to deleteTransaction, backing this action for the table's "Delete N
 * selected" bulk action. Transactions can span more than one account on the
 * /accounts/all view, so - unlike deleteTransaction, which only ever has one
 * owning account to adjust - balance deltas are summed per account first and
 * applied via applyBalanceDeltas, all inside the same prisma.$transaction as
 * the deletes.
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
      account: { select: { budgetId: true } },
    },
  });
  const authorizedIds = transactions.map((t) => t.id);

  const deltaByAccount = new Map<string, number>();
  for (const t of transactions) {
    deltaByAccount.set(
      t.accountId,
      (deltaByAccount.get(t.accountId) ?? 0) - t.amount,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: authorizedIds } } });
    await recordAuditEntries(
      tx,
      transactions.map((t) => ({
        budgetId: t.account.budgetId,
        entityType: "TRANSACTION" as const,
        entityId: t.id,
        action: "deleted",
        actorId: user.id,
        changes: diffFields(
          {
            accountId: t.accountId,
            date: t.date,
            payeeId: t.payeeId,
            categoryId: t.categoryId,
            memo: t.memo,
            amount: t.amount,
          },
          {},
        ),
      })),
    );
    await applyBalanceDeltas(tx, deltaByAccount);
  });

  revalidateAccountPaths([...deltaByAccount.keys()]);
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
export async function updateAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) {
    throw new Error("accountId is required");
  }
  const { user, budgetId } = await requireAccountAccess(accountId);

  const data: {
    name?: string;
    type?: AccountType;
    onBudget?: boolean;
    closed?: boolean;
  } = {};

  if (formData.has("name")) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      throw new Error("Account name is required");
    }
    data.name = name;
  }

  if (formData.has("type")) {
    const typeInput = String(formData.get("type") ?? "");
    if (!ACCOUNT_TYPES.includes(typeInput as AccountType)) {
      throw new Error("Invalid account type");
    }
    data.type = typeInput as AccountType;
  }

  if (formData.has("onBudget")) {
    data.onBudget = formData.get("onBudget") === "true";
  }

  if (formData.has("closed")) {
    data.closed = formData.get("closed") === "true";
  }

  if (Object.keys(data).length === 0) {
    return;
  }

  const before = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { name: true, type: true, onBudget: true, closed: true },
  });

  await prisma.$transaction((tx) =>
    auditedUpdate({
      tx,
      budgetId,
      entityType: "ACCOUNT",
      entityId: accountId,
      actorId: user.id,
      before,
      after: { ...before, ...data },
      apply: () => tx.account.update({ where: { id: accountId }, data }),
    }),
  );

  revalidateAccountPaths(accountId);
}

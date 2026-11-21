// Writes a Transfer (ADR 0007): two Transaction rows, one in each Account,
// linked through transferTransactionId, with shared date/memo and opposite
// amounts. Each row gets its own TRANSACTION audit entry. The category
// rule and the mirror live in src/lib/transfers.ts; this module applies them
// inside the caller's prisma transaction.

import type { Prisma } from "@prisma/client";
import { diffFields, recordAuditEntries, auditedDelete, auditedUpdate } from "@/lib/audit";
import { assertCategoryUsable } from "@/lib/systemCategories";
import {
  categoriesForEditedRow,
  counterpartSharedFields,
  resolveTransferCategories,
  selectLinkCandidates,
  transferAccountNameFromPayee,
  type SharedTransferFields,
} from "@/lib/transfers";
import { applyBalanceDelta, applyBalanceDeltas, findOrCreatePayee } from "./ledger";

type Tx = Prisma.TransactionClient;

export type AccountRef = {
  id: string;
  budgetId: string;
  name: string;
  onBudget: boolean;
  closed: boolean;
};

export type TransactionRef = {
  id: string;
  accountId: string;
  payeeId: string | null;
  categoryId: string | null;
  date: Date;
  amount: number;
  memo: string | null;
  transferTransactionId: string | null;
  payeeName: string | null;
};

export type DeletableTransaction = TransactionRef & { budgetId: string };

const accountSelect = {
  id: true,
  budgetId: true,
  name: true,
  onBudget: true,
  closed: true,
} as const;

function auditFields(row: {
  accountId: string;
  payeeId: string | null;
  categoryId: string | null;
  date: Date;
  amount: number;
  memo: string | null;
  transferTransactionId: string | null;
}) {
  return {
    accountId: row.accountId,
    payeeId: row.payeeId,
    categoryId: row.categoryId,
    date: row.date,
    amount: row.amount,
    memo: row.memo,
    transferTransactionId: row.transferTransactionId,
  };
}

async function requireAccount(tx: Tx, budgetId: string, accountId: string): Promise<AccountRef> {
  const account = await tx.account.findUnique({ where: { id: accountId }, select: accountSelect });
  if (!account || account.budgetId !== budgetId) throw new Error("Account not found");
  return account;
}

function assertOtherAccount(source: AccountRef, other: AccountRef, allowClosed: boolean) {
  if (other.budgetId !== source.budgetId) throw new Error("Account not found");
  if (other.id === source.id) throw new Error("A transfer can't move money to the same account");
  if (other.closed && !allowClosed) throw new Error("Choose an open account to transfer to");
}

async function assertResolvedCategory(
  tx: Tx,
  budgetId: string,
  accountId: string,
  categoryId: string | null,
) {
  if (categoryId) await assertCategoryUsable(tx, categoryId, { budgetId, accountId });
}

async function recordCreated(
  tx: Tx,
  budgetId: string,
  actorId: string,
  rows: ({ id: string } & Parameters<typeof auditFields>[0])[],
) {
  await recordAuditEntries(
    tx,
    rows.map((row) => ({
      budgetId,
      entityType: "TRANSACTION" as const,
      entityId: row.id,
      action: "created",
      actorId,
      changes: diffFields({}, auditFields(row)),
    })),
  );
}

type LinkRow = TransactionRef;

async function loadLinkRow(tx: Tx, id: string): Promise<LinkRow & { accountBudgetId: string }> {
  const row = await tx.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      accountId: true,
      payeeId: true,
      categoryId: true,
      date: true,
      amount: true,
      memo: true,
      transferTransactionId: true,
      payee: { select: { name: true } },
      account: { select: { budgetId: true } },
    },
  });
  if (!row) throw new Error("That transaction can't be linked to this transfer");
  return {
    id: row.id,
    accountId: row.accountId,
    payeeId: row.payeeId,
    categoryId: row.categoryId,
    date: row.date,
    amount: row.amount,
    memo: row.memo,
    transferTransactionId: row.transferTransactionId,
    payeeName: row.payee?.name ?? null,
    accountBudgetId: row.account.budgetId,
  };
}

function assertLinkable(row: LinkRow, otherAccountId: string, amount: number, date: Date) {
  const matches = selectLinkCandidates([row], { amount, date });
  if (matches.length !== 1 || row.accountId !== otherAccountId) {
    throw new Error("That transaction can't be linked to this transfer");
  }
}

/**
 * Creates the other side of a transfer, or links an existing unlinked row
 * there. `source` is a new row when `existingSource` is null.
 */
// fallow-ignore-next-line complexity
export async function createTransferPair(
  tx: Tx,
  args: {
    budgetId: string;
    actorId: string;
    sourceAccount: AccountRef;
    otherAccount: AccountRef;
    existingSource: TransactionRef | null;
    fields: SharedTransferFields;
    enteredCategoryId: string | null;
    linkTransactionId: string | null;
  },
): Promise<{ accountIds: string[]; sourceId: string; otherId: string }> {
  const { sourceAccount, otherAccount, fields } = args;
  assertOtherAccount(sourceAccount, otherAccount, false);

  const categories = resolveTransferCategories(
    { sourceOnBudget: sourceAccount.onBudget, otherOnBudget: otherAccount.onBudget },
    args.enteredCategoryId,
  );
  if (categories.error) throw new Error(categories.error);
  await assertResolvedCategory(
    tx,
    args.budgetId,
    sourceAccount.onBudget ? sourceAccount.id : otherAccount.id,
    sourceAccount.onBudget ? categories.sourceCategoryId : categories.otherCategoryId,
  );

  const link = args.linkTransactionId ? await loadLinkRow(tx, args.linkTransactionId) : null;
  if (link) {
    if (link.accountBudgetId !== args.budgetId) {
      throw new Error("That transaction can't be linked to this transfer");
    }
    assertLinkable(link, otherAccount.id, fields.amount, fields.date);
  }

  const sourceData = {
    accountId: sourceAccount.id,
    payeeId: null,
    categoryId: categories.sourceCategoryId,
    date: fields.date,
    amount: fields.amount,
    memo: fields.memo,
  };

  let sourceId: string;
  if (args.existingSource) {
    sourceId = args.existingSource.id;
    await tx.transaction.update({ where: { id: sourceId }, data: sourceData });
  } else {
    const created = await tx.transaction.create({ data: sourceData });
    sourceId = created.id;
  }

  if (link) {
    const linkedAfter = {
      payeeId: null as string | null,
      categoryId: categories.otherCategoryId,
      date: fields.date,
      memo: fields.memo,
      transferTransactionId: sourceId,
    };
    await auditedUpdate({
      tx,
      budgetId: args.budgetId,
      entityType: "TRANSACTION",
      entityId: link.id,
      actorId: args.actorId,
      before: {
        payeeId: link.payeeId,
        categoryId: link.categoryId,
        date: link.date,
        memo: link.memo,
        transferTransactionId: link.transferTransactionId,
      },
      after: linkedAfter,
      apply: () => tx.transaction.update({ where: { id: link.id }, data: linkedAfter }),
    });
    await tx.transaction.update({
      where: { id: sourceId },
      data: { transferTransactionId: link.id },
    });
    const sourceFinal = { ...sourceData, transferTransactionId: link.id };
    if (args.existingSource) {
      await auditedUpdate({
        tx,
        budgetId: args.budgetId,
        entityType: "TRANSACTION",
        entityId: sourceId,
        actorId: args.actorId,
        before: auditFields(args.existingSource),
        after: sourceFinal,
        apply: () => Promise.resolve(null),
      });
    } else {
      await recordCreated(tx, args.budgetId, args.actorId, [{ id: sourceId, ...sourceFinal }]);
    }
    const sourceDelta = args.existingSource ? fields.amount - args.existingSource.amount : fields.amount;
    await applyBalanceDelta(tx, sourceAccount.id, sourceDelta);
    return { accountIds: [sourceAccount.id, otherAccount.id], sourceId, otherId: link.id };
  }

  const otherFields = counterpartSharedFields(fields);
  const other = await tx.transaction.create({
    data: {
      accountId: otherAccount.id,
      payeeId: null,
      categoryId: categories.otherCategoryId,
      date: otherFields.date,
      amount: otherFields.amount,
      memo: otherFields.memo,
      transferTransactionId: sourceId,
    },
  });
  await tx.transaction.update({
    where: { id: sourceId },
    data: { transferTransactionId: other.id },
  });

  const sourceAudit = { id: sourceId, ...sourceData, transferTransactionId: other.id };
  const otherAudit = {
    id: other.id,
    accountId: otherAccount.id,
    payeeId: null,
    categoryId: categories.otherCategoryId,
    date: otherFields.date,
    amount: otherFields.amount,
    memo: otherFields.memo,
    transferTransactionId: sourceId,
  };

  if (args.existingSource) {
    await auditedUpdate({
      tx,
      budgetId: args.budgetId,
      entityType: "TRANSACTION",
      entityId: sourceId,
      actorId: args.actorId,
      before: auditFields(args.existingSource),
      after: { ...sourceData, transferTransactionId: other.id },
      apply: () => Promise.resolve(null),
    });
    await recordCreated(tx, args.budgetId, args.actorId, [otherAudit]);
    await applyBalanceDelta(tx, sourceAccount.id, fields.amount - args.existingSource.amount);
  } else {
    await recordCreated(tx, args.budgetId, args.actorId, [sourceAudit, otherAudit]);
    await applyBalanceDelta(tx, sourceAccount.id, fields.amount);
  }
  await applyBalanceDelta(tx, otherAccount.id, otherFields.amount);
  return { accountIds: [sourceAccount.id, otherAccount.id], sourceId, otherId: other.id };
}

export async function updateTransferPair(
  tx: Tx,
  args: {
    budgetId: string;
    actorId: string;
    source: TransactionRef;
    sourceAccount: AccountRef;
    counterpart: TransactionRef;
    counterpartAccount: AccountRef;
    nextAccount: AccountRef;
    fields: SharedTransferFields;
    enteredCategoryId: string | null | undefined;
  },
): Promise<{ accountIds: string[] }> {
  const moving = args.nextAccount.id !== args.counterpartAccount.id;
  assertOtherAccount(args.sourceAccount, args.nextAccount, !moving);

  const categories = categoriesForEditedRow({
    sourceOnBudget: args.sourceAccount.onBudget,
    otherOnBudget: args.nextAccount.onBudget,
    sourceCategoryId: args.source.categoryId,
    otherCategoryId: args.counterpart.categoryId,
    enteredCategoryId: args.enteredCategoryId,
  });
  if (categories.error) throw new Error(categories.error);
  await assertResolvedCategory(tx, args.budgetId, args.sourceAccount.id, categories.sourceCategoryId);
  await assertResolvedCategory(tx, args.budgetId, args.nextAccount.id, categories.otherCategoryId);

  const otherFields = counterpartSharedFields(args.fields);
  const sourceAfter = {
    payeeId: null as string | null,
    categoryId: categories.sourceCategoryId,
    date: args.fields.date,
    amount: args.fields.amount,
    memo: args.fields.memo,
  };
  const otherAfter = {
    accountId: args.nextAccount.id,
    payeeId: null as string | null,
    categoryId: categories.otherCategoryId,
    date: otherFields.date,
    amount: otherFields.amount,
    memo: otherFields.memo,
  };

  await auditedUpdate({
    tx,
    budgetId: args.budgetId,
    entityType: "TRANSACTION",
    entityId: args.source.id,
    actorId: args.actorId,
    before: {
      payeeId: args.source.payeeId,
      categoryId: args.source.categoryId,
      date: args.source.date,
      amount: args.source.amount,
      memo: args.source.memo,
    },
    after: sourceAfter,
    apply: () => tx.transaction.update({ where: { id: args.source.id }, data: sourceAfter }),
  });
  await auditedUpdate({
    tx,
    budgetId: args.budgetId,
    entityType: "TRANSACTION",
    entityId: args.counterpart.id,
    actorId: args.actorId,
    before: {
      accountId: args.counterpart.accountId,
      payeeId: args.counterpart.payeeId,
      categoryId: args.counterpart.categoryId,
      date: args.counterpart.date,
      amount: args.counterpart.amount,
      memo: args.counterpart.memo,
    },
    after: otherAfter,
    apply: () => tx.transaction.update({ where: { id: args.counterpart.id }, data: otherAfter }),
  });

  await applyBalanceDelta(tx, args.sourceAccount.id, args.fields.amount - args.source.amount);
  if (moving) {
    await applyBalanceDelta(tx, args.counterpartAccount.id, -args.counterpart.amount);
    await applyBalanceDelta(tx, args.nextAccount.id, otherFields.amount);
  } else {
    await applyBalanceDelta(tx, args.counterpartAccount.id, otherFields.amount - args.counterpart.amount);
  }
  return {
    accountIds: [args.sourceAccount.id, args.counterpartAccount.id, args.nextAccount.id],
  };
}

async function unlinkTransfer(
  tx: Tx,
  args: {
    budgetId: string;
    actorId: string;
    source: TransactionRef;
    sourceAccount: AccountRef;
    counterpart: TransactionRef;
    fields: SharedTransferFields;
    categoryId: string | null;
    payeeName: string;
  },
): Promise<{ accountIds: string[] }> {
  await assertResolvedCategory(tx, args.budgetId, args.sourceAccount.id, args.categoryId);
  const payeeId = args.payeeName
    ? await findOrCreatePayee(tx, args.budgetId, args.payeeName, args.actorId)
    : null;

  await tx.transaction.update({
    where: { id: args.source.id },
    data: { transferTransactionId: null },
  });
  await tx.transaction.update({
    where: { id: args.counterpart.id },
    data: { transferTransactionId: null },
  });

  await auditedDelete({
    tx,
    budgetId: args.budgetId,
    entityType: "TRANSACTION",
    entityId: args.counterpart.id,
    actorId: args.actorId,
    before: auditFields(args.counterpart),
    apply: () => tx.transaction.delete({ where: { id: args.counterpart.id } }),
  });
  await applyBalanceDelta(tx, args.counterpart.accountId, -args.counterpart.amount);

  const sourceAfter = {
    payeeId,
    categoryId: args.categoryId,
    date: args.fields.date,
    amount: args.fields.amount,
    memo: args.fields.memo,
    transferTransactionId: null,
  };
  await auditedUpdate({
    tx,
    budgetId: args.budgetId,
    entityType: "TRANSACTION",
    entityId: args.source.id,
    actorId: args.actorId,
    before: auditFields(args.source),
    after: sourceAfter,
    apply: () => tx.transaction.update({ where: { id: args.source.id }, data: sourceAfter }),
  });
  await applyBalanceDelta(tx, args.source.accountId, args.fields.amount - args.source.amount);
  return { accountIds: [args.source.accountId, args.counterpart.accountId] };
}

/**
 * Deletes every row it is given, and is the one place a transfer's two
 * sides come out together: callers pass the selected rows plus any
 * counterpart that wasn't selected. Links are cleared first so the
 * self-referential foreign key (and its delete trigger) doesn't remove a
 * row this function still owes an audit entry.
 */
export async function deleteTransferRows(
  tx: Tx,
  actorId: string,
  rows: DeletableTransaction[],
): Promise<string[]> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const list = [...byId.values()];
  if (list.length === 0) return [];
  const ids = list.map((row) => row.id);

  await tx.transaction.updateMany({
    where: { OR: [{ id: { in: ids } }, { transferTransactionId: { in: ids } }] },
    data: { transferTransactionId: null },
  });
  await tx.transaction.deleteMany({ where: { id: { in: ids } } });
  await recordAuditEntries(
    tx,
    list.map((row) => ({
      budgetId: row.budgetId,
      entityType: "TRANSACTION" as const,
      entityId: row.id,
      action: "deleted",
      actorId,
      changes: diffFields(auditFields(row), {}),
    })),
  );
  const deltaByAccount = new Map<string, number>();
  for (const row of list) {
    deltaByAccount.set(row.accountId, (deltaByAccount.get(row.accountId) ?? 0) - row.amount);
  }
  await applyBalanceDeltas(tx, deltaByAccount);
  return [...deltaByAccount.keys()];
}

export type TransferEdit = {
  budgetId: string;
  actorId: string;
  sourceId: string;
  fields: {
    date?: Date;
    amount?: number;
    memo?: string | null;
    categoryId?: string | null;
    payeeName?: string;
  };
  /** Set when the editor resolved a target account. Null means "not a transfer id". */
  transferAccountId: string | null;
  confirmUnlink: boolean;
  linkTransactionId: string | null;
};

type LoadedTransaction = TransactionRef & { account: AccountRef };

const transactionSelect = {
  id: true,
  accountId: true,
  payeeId: true,
  categoryId: true,
  date: true,
  amount: true,
  memo: true,
  transferTransactionId: true,
  payee: { select: { name: true } },
  account: { select: accountSelect },
} as const;

function toRef(row: {
  id: string;
  accountId: string;
  payeeId: string | null;
  categoryId: string | null;
  date: Date;
  amount: number;
  memo: string | null;
  transferTransactionId: string | null;
  payee: { name: string } | null;
  account: AccountRef;
}): LoadedTransaction {
  return {
    id: row.id,
    accountId: row.accountId,
    payeeId: row.payeeId,
    categoryId: row.categoryId,
    date: row.date,
    amount: row.amount,
    memo: row.memo,
    transferTransactionId: row.transferTransactionId,
    payeeName: row.payee?.name ?? null,
    account: row.account,
  };
}

async function loadTransaction(tx: Tx, id: string, budgetId: string): Promise<LoadedTransaction> {
  const row = await tx.transaction.findUnique({ where: { id }, select: transactionSelect });
  if (!row || row.account.budgetId !== budgetId) throw new Error("Transaction not found");
  return toRef(row);
}

async function accountByName(
  tx: Tx,
  budgetId: string,
  sourceAccountId: string,
  name: string,
  current: AccountRef | null,
): Promise<AccountRef> {
  if (current && current.name === name) return current;
  const accounts = await tx.account.findMany({
    where: { budgetId, name, NOT: { id: sourceAccountId } },
    select: accountSelect,
  });
  const open = accounts.filter((account) => !account.closed);
  if (open.length === 1) return open[0];
  if (open.length > 1) throw new Error(`More than one open account is named ${name}`);
  throw new Error(`No open account is named ${name}`);
}

/**
 * Applies an edit that creates, moves, mirrors, or unlinks a transfer.
 * An ordinary edit never reaches this function.
 */
/** Creates a brand-new transfer from an account the editor is adding a row to. */
export async function startTransfer(
  tx: Tx,
  args: {
    budgetId: string;
    actorId: string;
    sourceAccountId: string;
    transferAccountId: string | null;
    payeeName: string;
    fields: SharedTransferFields;
    enteredCategoryId: string | null;
    linkTransactionId: string | null;
  },
): Promise<{ accountIds: string[] }> {
  const sourceAccount = await requireAccount(tx, args.budgetId, args.sourceAccountId);
  const wanted = transferAccountNameFromPayee(args.payeeName);
  if (!args.transferAccountId && !wanted) throw new Error("Choose an account to transfer to");
  const otherAccount = args.transferAccountId
    ? await requireAccount(tx, args.budgetId, args.transferAccountId)
    : await accountByName(tx, args.budgetId, sourceAccount.id, wanted as string, null);
  const created = await createTransferPair(tx, {
    budgetId: args.budgetId,
    actorId: args.actorId,
    sourceAccount,
    otherAccount,
    existingSource: null,
    fields: args.fields,
    enteredCategoryId: args.enteredCategoryId,
    linkTransactionId: args.linkTransactionId,
  });
  return { accountIds: created.accountIds };
}

function sharedEditFields(edit: TransferEdit, source: LoadedTransaction): SharedTransferFields {
  return {
    date: edit.fields.date ?? source.date,
    amount: edit.fields.amount ?? source.amount,
    memo: edit.fields.memo !== undefined ? edit.fields.memo : source.memo,
  };
}

async function accountNamedInPayee(
  tx: Tx,
  edit: TransferEdit,
  source: LoadedTransaction,
  counterpart: LoadedTransaction | null,
): Promise<AccountRef | null> {
  if (edit.fields.payeeName === undefined) return counterpart ? counterpart.account : null;
  const wanted = transferAccountNameFromPayee(edit.fields.payeeName);
  if (!wanted) return null;
  return accountByName(tx, edit.budgetId, source.accountId, wanted, counterpart?.account ?? null);
}

async function resolveEditAccount(
  tx: Tx,
  edit: TransferEdit,
  source: LoadedTransaction,
  counterpart: LoadedTransaction | null,
): Promise<AccountRef | null> {
  if (edit.transferAccountId) return requireAccount(tx, edit.budgetId, edit.transferAccountId);
  return accountNamedInPayee(tx, edit, source, counterpart);
}

function editedCategory(edit: TransferEdit, source: LoadedTransaction): string | null {
  return edit.fields.categoryId === undefined ? source.categoryId : edit.fields.categoryId;
}

export async function applyTransferEdit(tx: Tx, edit: TransferEdit): Promise<{ accountIds: string[] }> {
  const source = await loadTransaction(tx, edit.sourceId, edit.budgetId);
  const counterpart = source.transferTransactionId
    ? await loadTransaction(tx, source.transferTransactionId, edit.budgetId)
    : null;
  const fields = sharedEditFields(edit, source);
  const nextAccount = await resolveEditAccount(tx, edit, source, counterpart);

  if (counterpart && !nextAccount) {
    if (!edit.confirmUnlink) {
      throw new Error(
        `This transfer is linked to ${counterpart.account.name}. Confirm removing that side before changing the payee.`,
      );
    }
    return unlinkTransfer(tx, {
      budgetId: edit.budgetId,
      actorId: edit.actorId,
      source,
      sourceAccount: source.account,
      counterpart,
      fields,
      categoryId: editedCategory(edit, source),
      payeeName: edit.fields.payeeName ?? "",
    });
  }
  if (!nextAccount) throw new Error("Choose an account to transfer to");
  if (counterpart) {
    return updateTransferPair(tx, {
      budgetId: edit.budgetId,
      actorId: edit.actorId,
      source,
      sourceAccount: source.account,
      counterpart,
      counterpartAccount: counterpart.account,
      nextAccount,
      fields,
      enteredCategoryId: edit.fields.categoryId,
    });
  }
  return createTransferPair(tx, {
    budgetId: edit.budgetId,
    actorId: edit.actorId,
    sourceAccount: source.account,
    otherAccount: nextAccount,
    existingSource: source,
    fields,
    enteredCategoryId: editedCategory(edit, source),
    linkTransactionId: edit.linkTransactionId,
  });
}

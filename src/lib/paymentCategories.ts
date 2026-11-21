import type { AccountType, Prisma } from "@prisma/client";
import { isDebtAccountType } from "@/lib/accountTypes";
import { auditedCreate, auditedDelete, auditedUpdate } from "@/lib/audit";

/** The system group that holds one Payment Category per on-budget card (ADR 0010). */
export const CREDIT_CARD_PAYMENTS_GROUP = "Credit Card Payments";

export const PAYMENT_CATEGORY_RENAME =
  "A Payment Category's name follows its account";
export const PAYMENT_CATEGORY_MOVE =
  "A Payment Category stays in Credit Card Payments";
export const PAYMENT_CATEGORY_UNHIDE =
  "A closed card's Payment Category stays hidden until the card is reopened";
export const PAYMENT_CATEGORY_IN_USE =
  "This account's Payment Category still has assignments or a target, so the account has to stay an on-budget credit card";

type Tx = Prisma.TransactionClient;

/** A Payment Category exists exactly while the account is an on-budget card or line of credit. */
export function accountQualifiesForPaymentCategory(type: string, onBudget: boolean): boolean {
  return onBudget && isDebtAccountType(type);
}

/**
 * The category a new account's Starting Balance uses. A negative balance on
 * a card stays uncategorized and outside the budget. Zero or positive is
 * Inflow: Ready to Assign, like any other on-budget account (ADR 0008, ADR 0010).
 */
export function startingBalanceCategoryId(
  type: string,
  balance: number,
  readyToAssignId: string,
): string | null {
  if (isDebtAccountType(type) && balance < 0) return null;
  return readyToAssignId;
}

async function creditCardPaymentsGroup(tx: Tx, budgetId: string, actorId: string) {
  const existing = await tx.categoryGroup.findUnique({
    where: { budgetId_systemKind: { budgetId, systemKind: "CREDIT_CARD_PAYMENTS" } },
  });
  if (existing) return existing;

  const last = await tx.categoryGroup.findFirst({
    where: { budgetId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;
  return auditedCreate({
    tx,
    budgetId,
    entityType: "CATEGORY_GROUP",
    actorId,
    apply: () =>
      tx.categoryGroup.create({
        data: { budgetId, name: CREDIT_CARD_PAYMENTS_GROUP, sortOrder, systemKind: "CREDIT_CARD_PAYMENTS" },
      }),
    entityId: (group) => group.id,
    fields: (group) => ({ name: group.name, sortOrder: group.sortOrder, systemKind: "CREDIT_CARD_PAYMENTS" }),
  });
}

/** Creates the account's Payment Category when it doesn't have one yet. */
export async function ensurePaymentCategory(
  tx: Tx,
  {
    budgetId,
    actorId,
    account,
  }: { budgetId: string; actorId: string; account: { id: string; name: string; closed: boolean } },
) {
  const existing = await tx.category.findUnique({ where: { paymentForAccountId: account.id } });
  if (existing) return existing;

  const group = await creditCardPaymentsGroup(tx, budgetId, actorId);
  const last = await tx.category.findFirst({
    where: { categoryGroupId: group.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;
  return auditedCreate({
    tx,
    budgetId,
    entityType: "CATEGORY",
    actorId,
    apply: () =>
      tx.category.create({
        data: {
          categoryGroupId: group.id,
          name: account.name,
          sortOrder,
          hidden: account.closed,
          paymentForAccountId: account.id,
        },
      }),
    entityId: (category) => category.id,
    fields: (category) => ({
      categoryGroupId: group.id,
      name: category.name,
      sortOrder: category.sortOrder,
      hidden: category.hidden,
      paymentForAccountId: account.id,
    }),
  });
}

async function removePaymentCategory(
  tx: Tx,
  { budgetId, actorId, category }: { budgetId: string; actorId: string; category: { id: string; name: string; categoryGroupId: string; paymentForAccountId: string | null } },
) {
  const [assigned, targets, transactions] = await Promise.all([
    tx.categoryMonth.count({ where: { categoryId: category.id, budgeted: { not: 0 } } }),
    tx.categoryTarget.count({ where: { categoryId: category.id } }),
    tx.transaction.count({ where: { categoryId: category.id } }),
  ]);
  // Assignments are what ADR 0010 names. A target or a transaction would be
  // destroyed with the category, so those block the change too.
  if (assigned > 0 || targets > 0 || transactions > 0) {
    throw new Error(PAYMENT_CATEGORY_IN_USE);
  }

  await auditedDelete({
    tx,
    budgetId,
    entityType: "CATEGORY",
    entityId: category.id,
    actorId,
    before: {
      name: category.name,
      categoryGroupId: category.categoryGroupId,
      paymentForAccountId: category.paymentForAccountId,
    },
    apply: () => tx.category.delete({ where: { id: category.id } }),
  });

  const remaining = await tx.category.count({ where: { categoryGroupId: category.categoryGroupId } });
  if (remaining > 0) return;
  const group = await tx.categoryGroup.findUniqueOrThrow({
    where: { id: category.categoryGroupId },
    select: { name: true, sortOrder: true, systemKind: true },
  });
  await auditedDelete({
    tx,
    budgetId,
    entityType: "CATEGORY_GROUP",
    entityId: category.categoryGroupId,
    actorId,
    before: group,
    apply: () => tx.categoryGroup.delete({ where: { id: category.categoryGroupId } }),
  });
}

export interface PaymentAccountSnapshot {
  name: string;
  type: AccountType;
  onBudget: boolean;
  closed: boolean;
}

/**
 * Keeps the Payment Category in step with its account: created when the
 * account becomes an on-budget card, removed when it stops (only if nothing
 * is assigned to it), renamed with the account, and hidden while the
 * account is closed. Reopening unhides it.
 */
export async function syncPaymentCategory(
  tx: Tx,
  {
    budgetId,
    actorId,
    accountId,
    before,
    after,
  }: {
    budgetId: string;
    actorId: string;
    accountId: string;
    before: PaymentAccountSnapshot;
    after: PaymentAccountSnapshot;
  },
) {
  const was = accountQualifiesForPaymentCategory(before.type, before.onBudget);
  const now = accountQualifiesForPaymentCategory(after.type, after.onBudget);
  const existing = await tx.category.findUnique({
    where: { paymentForAccountId: accountId },
    select: { id: true, name: true, hidden: true, categoryGroupId: true, paymentForAccountId: true },
  });

  if (!now) {
    if (existing && was) {
      await removePaymentCategory(tx, { budgetId, actorId, category: existing });
    }
    return;
  }

  if (!existing) {
    await ensurePaymentCategory(tx, {
      budgetId,
      actorId,
      account: { id: accountId, name: after.name, closed: after.closed },
    });
    return;
  }

  if (existing.name === after.name && existing.hidden === after.closed) return;
  await auditedUpdate({
    tx,
    budgetId,
    entityType: "CATEGORY",
    entityId: existing.id,
    actorId,
    before: { name: existing.name, hidden: existing.hidden },
    after: { name: after.name, hidden: after.closed },
    apply: () =>
      tx.category.update({
        where: { id: existing.id },
        data: { name: after.name, hidden: after.closed },
      }),
  });
}

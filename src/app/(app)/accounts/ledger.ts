import type { Prisma } from "@prisma/client";
import { diffFields, recordAuditEntry } from "@/lib/audit";

/**
 * The interactive-transaction client every helper here takes, so a
 * caller's ledger writes always land inside its own `prisma.$transaction`
 * alongside whatever transaction-row mutation they're paired with, rather
 * than opening a transaction of their own — see applyBalanceDelta.
 */
type TransactionClient = Prisma.TransactionClient;

/**
 * Single owner of the "`Account.balance` is a cached running total"
 * invariant (#47). Every transaction-mutating action in this directory
 * routes its balance bookkeeping through this (or applyBalanceDeltas,
 * below) instead of re-deriving its own increment/decrement/`Map` — five
 * call sites each did it a different way before this existed.
 *
 * Takes the caller's `tx` rather than opening its own transaction so the
 * balance update commits atomically with the transaction-row write it's
 * paired with: a crash between the two would otherwise leave `balance`
 * silently wrong with nothing to detect it.
 *
 * `delta` is signed — positive increases the account's balance, negative
 * decreases it — hiding the Prisma increment/decrement mechanics behind
 * one "give me a signed delta" interface. A zero delta is a no-op.
 */
export async function applyBalanceDelta(
  tx: TransactionClient,
  accountId: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  await tx.account.update({
    where: { id: accountId },
    data: { balance: { increment: delta } },
  });
}

/**
 * The multi-account counterpart to applyBalanceDelta, for a caller (like
 * deleteTransactions) that already has deltas summed per account — it
 * passes the `Map` straight through instead of unpacking it back into a
 * loop of its own.
 */
export async function applyBalanceDeltas(
  tx: TransactionClient,
  deltaByAccount: Map<string, number>,
): Promise<void> {
  for (const [accountId, delta] of deltaByAccount) {
    await applyBalanceDelta(tx, accountId, delta);
  }
}

/**
 * Finds a payee by (budgetId, name), creating it if this is the first
 * time that name has been used in this budget. Reimplemented separately
 * by createTransaction, updateTransaction and importTransactions before
 * #47 — the last with its own in-loop cache `Map`, which still lives in
 * importTransactions rather than here, since a per-import-batch cache
 * isn't this helper's concern.
 *
 * `name` is matched as given — callers are expected to have already
 * trimmed it, and an empty name isn't meaningful here (callers treat that
 * as "no payee" and don't call this at all).
 *
 * Writes the PAYEE "created" AuditEntry (#75/ADR 0002) itself, only on the
 * create path — a plain lookup that finds an existing payee isn't a
 * mutation, so it has nothing to log.
 */
export async function findOrCreatePayee(
  tx: TransactionClient,
  budgetId: string,
  name: string,
  actorId: string,
): Promise<string> {
  const existing = await tx.payee.findFirst({ where: { budgetId, name } });
  if (existing) return existing.id;

  const created = await tx.payee.create({ data: { budgetId, name } });
  await recordAuditEntry(tx, {
    budgetId,
    entityType: "PAYEE",
    entityId: created.id,
    action: "created",
    actorId,
    changes: diffFields({}, { name }),
  });
  return created.id;
}

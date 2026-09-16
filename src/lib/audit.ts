import type { AuditEntityType, Prisma } from "@prisma/client";

/**
 * The interactive-transaction client every audit write goes through, so an
 * AuditEntry always commits atomically alongside the mutation it's
 * recording — see recordAuditEntry.
 */
type TransactionClient = Prisma.TransactionClient;

type FieldDiff = Record<string, [unknown, unknown]>;

/**
 * JSON-normalizes a single field value for storage/comparison in a
 * `changes` diff: `Date`s (not directly JSON-serializable through Prisma's
 * `Json` columns) become ISO strings, `undefined`/missing values become
 * `null` so a create's "no prior value" and an update's "field not
 * present" read the same way.
 */
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

/**
 * The single diffing helper ADR 0002 calls for, shared across every
 * Budget-scoped mutation site instead of one-off per call: computes the
 * `{ field: [old, new] }` diff `AuditEntry.changes` stores, keyed by every
 * field present on either side. Serves all three shapes call sites need —
 * `diffFields({}, after)` for a create (every field reads `[null, value]`),
 * `diffFields(before, after)` for an update (only fields present in
 * `after` that actually changed — pass just the fields being touched, not
 * every column), and `diffFields(before, {})` for a delete (every field
 * reads `[value, null]`).
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff {
  const changes: FieldDiff = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const oldValue = normalize(before[key]);
    const newValue = normalize(after[key]);
    if (oldValue !== newValue) {
      changes[key] = [oldValue, newValue];
    }
  }
  return changes;
}

export interface AuditEntryInput {
  budgetId: string;
  entityType: AuditEntityType;
  entityId: string;
  /**
   * Free text, not the `AuditEntityType` enum: generic CRUD
   * ("created"/"updated"/"deleted") plus the membership-specific phrasing
   * ADR 0002/0004 use verbatim ("invite sent"/"invite accepted"/
   * "invite revoked", "collaborator removed", "ownership transferred").
   */
  action: string;
  actorId: string;
  changes: FieldDiff;
}

/**
 * Writes a single AuditEntry — always via the caller's interactive
 * `tx`, so the entry commits atomically with the mutation it records
 * rather than as a separate, potentially-inconsistent write. A no-op diff
 * (nothing actually changed) writes nothing, the same way callers already
 * skip a Prisma write entirely when an update's `data` ends up empty.
 */
export async function recordAuditEntry(
  tx: TransactionClient,
  entry: AuditEntryInput,
): Promise<void> {
  if (Object.keys(entry.changes).length === 0) return;
  await tx.auditEntry.create({
    data: { ...entry, changes: entry.changes as Prisma.InputJsonValue },
  });
}

/**
 * The bulk counterpart to recordAuditEntry, for a caller (importTransactions,
 * deleteTransactions, acceptPendingInvites) that already has one entry per
 * row rather than a single mutation — one `createMany` instead of N
 * `create` round trips, same reasoning as the balance/payee batching
 * elsewhere in this codebase. Entries with an empty diff are dropped
 * rather than written as no-ops.
 */
export async function recordAuditEntries(
  tx: TransactionClient,
  entries: AuditEntryInput[],
): Promise<void> {
  const nonEmpty = entries.filter((entry) => Object.keys(entry.changes).length > 0);
  if (nonEmpty.length === 0) return;
  await tx.auditEntry.createMany({
    data: nonEmpty.map((entry) => ({
      ...entry,
      changes: entry.changes as Prisma.InputJsonValue,
    })),
  });
}

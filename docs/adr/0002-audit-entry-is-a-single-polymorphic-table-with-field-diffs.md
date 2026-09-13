# AuditEntry is a single polymorphic table with field-level diffs

We're recording who changed what across every Budget-scoped mutation
(accounts, categories, category-month budgeted amounts, payees,
transactions, and membership changes — invites, collaborator removal,
ownership transfer). We store this as one `AuditEntry` table per change,
referencing the mutated row polymorphically via an `entityType` enum +
`entityId` string, with a `changes` JSON column holding a field-level diff
(`{ field: [old, new] }`), rather than one table per entity type or a
full-row snapshot.

A single table gives one query for "everything that happened on this
budget," which a per-entity-type table (`AccountAuditEntry`,
`TransactionAuditEntry`, ...) can't do without a union across six-plus
tables — a real cost given the scope spans that many entity types. The
tradeoff is that `entityId` isn't a real foreign key, so referential
integrity there is enforced at the app layer, not the schema. The
field-level diff was chosen over logging just the fact of a mutation
("edited Transaction X") because the point of the log is answering "what
changed," and over a full before/after snapshot because per-mutation diffs
in this app are small (a handful of scalar fields), so there's no size
pressure pushing toward snapshots; the downside is every write site needs
to compute its own diff rather than just recording that a write happened.

`AuditEntry.actor` is always a User (owner or collaborator) — never a
system or cron process, since this only covers changes made by people —
and entries are kept forever, with no retention or pruning in scope.

## Considered options

- **Per-entity-type audit tables** — rejected: real FKs and full
  referential integrity, but six-plus near-identical tables and no single
  "recent activity on this budget" query.
- **Fact-only entries** (no diff) — rejected: cheapest to write, but
  doesn't answer "what changed," which is the log's whole purpose.
- **Full row snapshots** (before/after) — rejected: simplest to compute
  (no diffing logic), but bulkier than needed for this app's small rows
  and includes unchanged fields.

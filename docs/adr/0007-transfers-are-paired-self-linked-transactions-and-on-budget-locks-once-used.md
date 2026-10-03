# Transfers are paired, self-linked transactions, and on-budget locks once an account is used

A Transfer between two Accounts is stored as two `Transaction` rows, one
in each Account, with opposite amounts. Each row points at the other
through a nullable, unique `transferTransactionId`, and `payeeId` stays
null. The UI shows "Transfer: <other account>" from the link. We chose
this so that each Account's ledger stays a plain list of its own rows:
the cached `Account.balance`, per-account lists, filters, import duplicate
checks and reconcile all keep working unchanged. Date, amount (negated)
and memo are shared, so an edit to one row updates the other in the same
DB transaction. Cleared status and category belong to each row. Deleting
either row deletes both. Each row writes its own `TRANSACTION`
AuditEntry, as [ADR 0002](0002-audit-entry-is-a-single-polymorphic-table-with-field-diffs.md) already requires.

Whether a row carries a category depends on the Accounts' on-budget flags.
On ↔ on: neither row has a category. On ↔ off: the on-budget row must
have one. Off ↔ off: neither row has a category. To keep that invariant,
`Account.onBudget` can only be edited while the Account has no
transactions (a starting balance counts). After that, the user closes the
Account and opens a new one, as in YNAB.

## Considered Options

- **A separate `Transfer` table** (from, to, amount, date): rejected
  because every ledger, balance, filter, import and reconcile path would
  have to union it in.
- **A system "Transfer : <Account>" Payee per Account** (YNAB's API
  shape): rejected. It adds payee rows that have to be created, renamed
  and hidden along with their accounts, and the self-link already gives
  the UI everything it needs.
- **Leaving `onBudget` freely editable**: rejected. A flip would leave
  existing rows breaking the categorization rule, and fixing them
  automatically would mean silent data changes.

# Deleting a category is a hard delete that merges into a replacement

A category can be deleted as well as hidden. Hide stays the reversible,
view-only option. Delete removes the `Category` row for good, and the money
follows the rule already set in
[ADR 0009](0009-category-available-resets-at-month-rollover-derived-from-full-history.md):

- **No transactions:** the category's `CategoryMonth` rows are deleted with
  it, so everything it had assigned, in any month, returns to Ready to
  Assign. Only transactions decide this. A category with assignments but no
  transactions needs no replacement. To keep that money in another category,
  the user moves it with Move Money before deleting.
- **Has transactions:** the user must pick a replacement category. Every
  transaction is re-pointed to it. Each `CategoryMonth` is moved to the
  replacement, or added onto the replacement's row when both have one in the
  same month (deleted $50 + replacement $30 in May = $80 in May). The total
  assigned in every month is unchanged, so Ready to Assign is too. Available
  is recomputed from full history, and two merged overspends can roll over
  differently than they did apart. That is accepted.

Which categories take part:

- **Can't be deleted:** Inflow: Ready to Assign
  ([ADR 0008](0008-ready-to-assign-income-is-a-system-category.md)) and
  Payment Categories
  ([ADR 0010](0010-credit-cards-get-a-payment-category-funded-cash-first-per-month.md)),
  which follow their account. The delete button isn't shown for them, and
  the server refuses them.
- **Can be the replacement:** any other category in the same Budget, hidden
  ones and Payment Categories included. Inflow: Ready to Assign can't hold
  assignments, and Uncategorized isn't a category, so neither is offered.

The deleted category's `CategoryTarget` and `CategoryTargetSnooze` rows
([ADR 0011](0011-category-targets-are-effective-from-month-rows.md)) are
dropped. The replacement keeps its own target unchanged.

**UI:** a trash icon in the inline rename row, next to Hide, in both the
group list and the Hidden section. It opens a confirm dialog:

- with no transactions, the dialog says how much returns to Ready to Assign
  and over how many months;
- with transactions, it has a required "Move N transactions and assignments
  to…" picker, grouped like the budget page, with hidden categories under
  "Hidden".

The server counts the transactions again when the form is submitted. If
any now exist and no replacement was given, it refuses the delete, so a
dialog opened earlier can't drop money that should have moved.

**Audit** ([ADR 0002](0002-audit-entry-is-a-single-polymorphic-table-with-field-diffs.md)):
one entry per changed row, written in the same database transaction as the
delete:

- a `TRANSACTION` update per re-pointed transaction (`categoryId` diff)
- a `CATEGORY_MONTH` entry per affected month: an update of the
  replacement's `budgeted` when amounts are added together, a `categoryId`
  update when a row moves, or a delete when a row is dropped
- `CATEGORY_TARGET` / `CATEGORY_TARGET_SNOOZE` deletes for dropped target
  rows
- a `CATEGORY` delete with the before-snapshot, plus the replacement's id
  when there is one

## Considered Options

- **Soft delete (`deletedAt`)**: rejected. Hide already covers the reversible
  case, and after a merge nothing references the row. A soft delete would
  need a `deletedAt IS NULL` filter on every category query. Audit
  `entityId` isn't a foreign key, so history survives the row anyway.
- **Delete only from the Hidden section** (hide first, then delete):
  rejected because it adds a step without adding any safety the confirm
  dialog doesn't already give.
- **Assignments also require a replacement**, or an optional picker when
  there are no transactions: rejected to keep ADR 0009's rule as written.
  Move Money already covers keeping the money.
- **The replacement's assignment wins**, or dropping every assignment on a
  merge: rejected because either one moves money into Ready to Assign that
  the user had set aside.
- **One summary audit entry**: rejected because "what happened to this
  transaction" could then only be answered by searching inside another
  entity's diff. Transfers and Move Money already log one entry per row.
- **Inheriting the deleted category's target**: rejected because merging
  two targets has no obvious meaning. The user can set the replacement's
  target afterwards.

## Consequences

The relation defaults must not do the work silently. `Transaction.categoryId`
is SetNull by default, so a bare `category.delete` would turn the
transactions into Uncategorized without asking. The delete action
re-points them explicitly, and only deletes once none are left. A large
category writes one audit entry per transaction, bounded by that one
category's history.

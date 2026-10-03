# Ready to Assign income is a system category, and uncategorized means "needs attention"

Money is Ready to Assign income only when its transaction is categorized
**Inflow: Ready to Assign**. That is a real `Category` row, seeded once per
Budget and marked system-owned. It can't be assigned to, renamed, hidden or
deleted, and it isn't a row on the budget page. Any on-budget transaction
can use it, inflow or outflow, including the on-budget side of an
on ↔ off-budget Transfer. Transactions in off-budget Accounts never count.
An on-budget cash Account's Starting Balance is categorized Inflow: Ready
to Assign. A credit or loan Account's Starting Balance follows the
credit-card rules instead. An uncategorized on-budget transaction (one that
isn't a Transfer) doesn't count as income. It lands in a read-only
**Uncategorized** row on the budget page, where a negative Available is
overspending like any other category's. We chose this, like YNAB, so a
refund that was never categorized can't silently turn into assignable
money, and so ADR 0007's rule that the on-budget side of an on ↔ off
Transfer has a category needs no exception.

## Considered Options

- **Implicit: any uncategorized on-budget inflow counts.** No schema
  change. Rejected because "not yet categorized" and "income" become the
  same thing, and an on ↔ off inflow (which must carry a category) could
  never be income.
- **A `readyToAssign` flag on `Transaction`** with no category. Rejected
  because it adds a second category-like field to every row and needs an
  exception to ADR 0007.

## Consequences

When this ships, existing budgets only have their Starting Balance rows on
on-budget cash Accounts re-categorized. Every other existing uncategorized
inflow, past paychecks included, stays uncategorized and shows in the
Uncategorized row until the user categorizes it.

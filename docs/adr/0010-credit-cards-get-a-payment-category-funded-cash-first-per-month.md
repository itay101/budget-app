# Credit cards get a payment category, funded cash-first per month and derived at read time

Every on-budget Credit Card or Line of Credit Account has exactly one
**Payment Category**. It is an ordinary `Category` row with a nullable,
unique `paymentForAccountId` pointing at the Account, kept in a system
"Credit Card Payments" group. It can be assigned to and moved like any
category, but no transaction can be categorized to it. New card and line of
credit Accounts now default to on-budget.

Card spending moves money into the Payment Category by derivation, not by
stored moves. For each category and Budget Month:

```
cashLeft      = max(0, Available(M-1)) + assigned(M) + netCashActivity(M)
funded        = clamp(cashLeft, 0, netCardSpending(M))   # split across cards
creditOverspend = netCardSpending(M) - funded
cashOverspend   = max(0, -cashLeft)
```

Cash spending is covered first, and what's left covers the month's net card
spending. When several cards share the shortfall, `funded` is split in
proportion to each card's net spending, with largest-remainder rounding. A
month where a card's net activity in a category is an inflow (a refund)
moves that amount back out of the Payment Category. Payment Category
Activity is the funded card spending, minus every on-budget Transfer into
the card, plus every on-budget Transfer out of it (a cash advance). At the
rollover the category resets to zero as in [ADR 0009](0009-category-available-resets-at-month-rollover-derived-from-full-history.md),
and only `cashOverspend` comes out of Ready to Assign. Credit overspending
stays as card debt that the Payment Category doesn't cover. The Uncategorized
row follows the same rule. Paying more than a Payment Category's Available
makes it negative, which is ordinary cash overspending.

A card's own balance plays no part. Unlike YNAB, spending on a card that is
in credit is treated like any other card spending. A negative card Starting
Balance has no category and stays outside the budget math, so the Payment
Category starts at zero while the card owes money. A positive one is
categorized Inflow: Ready to Assign ([ADR 0008](0008-ready-to-assign-income-is-a-system-category.md)).

We chose monthly aggregates over row order so the read path keeps working
from per-month totals, and editing a date within a month never shifts money
between cash and card.

## Considered Options

- **Stored moves** (a CategoryMonth adjustment written with each card
  transaction): rejected because every edit, delete, re-categorization and
  back-dated change would have to rebalance it.
- **Chronological coverage** (cover each row in date order): rejected
  because it needs per-row ordering at read time and is sensitive to edits
  of the date within a month.
- **Card-first coverage**: rejected because it turns more of a mixed
  overspend into cash overspending against Ready to Assign.
- **YNAB's positive-balance rule**: rejected because it needs each card's
  running balance inside the budget math, for a rare case the user can fix
  by moving money.
- **A separate payment-category table or a `Category.kind` enum**: rejected
  because it duplicates assign, move and target logic, or reworks ADR 0008
  for no gain.

## Consequences

A Payment Category exists exactly while its Account is on-budget and a card
or line of credit. Its name is read from the Account, and closing the
Account hides it without losing its money. An Account's type locks once it
has transactions, like the on-budget flag (ADR 0007). When this ships, a
data migration creates Payment Categories for existing on-budget cards and
lines of credit, and their past months are recomputed. Off-budget cards are
left alone. Loan accounts are out of scope.

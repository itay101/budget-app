# Category Available resets at the month rollover, and everything is derived from full history

A category's Available no longer runs forever. When a month ends with a
negative Available (cash overspending), the next month starts that category
at zero, and the shortfall comes out of that next month's Ready to Assign.
A positive Available carries forward unchanged.

```
Available(M) = max(0, Available(M-1)) + assigned(M) + activity(M)

RTA(M) = Ready to Assign income through M
       - cash overspending in every month before M
       - everything assigned in M and every month before it
       - (current Budget Month and later only) everything assigned in any later month
```

A negative Ready to Assign carries forward as-is, so later income covers
it first. Money assigned to a future month comes out of the current month
straight away. The same rules apply to hidden categories, because hiding
only changes the view, and to the Uncategorized row. A positive
Uncategorized balance never becomes income ([ADR 0008](0008-ready-to-assign-income-is-a-system-category.md)).
Credit overspending never reaches Ready to Assign. Which part of a mixed
cash-and-card overspend counts as cash is left to the credit-card work.

An earlier Budget Month shows its own Ready to Assign: the last term is
left out, so a later assignment never changes it. The current month and
later keep the last term, which is how money assigned to a future month
comes out of the current month straight away. An earlier month's box also
shows the current month's figure alongside its own, because assigning
there costs the current month too.

Assigning in an earlier month, by Move Money from Ready to Assign or by
changing a category's assigned amount, is allowed. It lowers Ready to
Assign in that month and every month after it. It may leave that month's
own figure negative, which is shown in red, the same as a negative current
month. Auto-Assign is stricter: in an earlier month it adds money only
while no month from that one through the current month would go below
zero.

Nothing about the rollover is stored. Every month is recomputed at read
time from transactions and assignments, as Available already is. An edit
to a past month, such as a back-dated transaction or a changed assignment,
carries forward on its own. Its new overspending lowers Ready to Assign in
every later month, including the current one, and editing shows no warning
even when it leaves a month's figure negative. A deleted category follows
the same rule: with no transactions its assignments are dropped, so the
money returns to Ready to Assign. With transactions, its transactions and
assignments move to a replacement category and every month is recomputed.
We chose this to match YNAB, so overspending is visible for one month and
then absorbed instead of silently dragging a category down forever.

## Considered Options

- **Keep the running total** (today's `availableFor`): rejected because an
  overspent category stays negative in every later month and Ready to
  Assign never reflects money that was actually spent.
- **Show the current-month formula in past months too**: rejected because
  it takes off every later assignment, so a past month shows a confusing,
  often negative number that no action in that month can fix. Leaving the
  later-month term out of past months answers that objection.
- **Show zero in past months and refuse Move Money from Ready to Assign
  there** (this ADR's earlier rule): rejected because the owner wants each
  month to show what it had left. Refusing Move Money only added friction,
  because editing a category's assigned amount had the same effect on the
  money.
- **Never let a past month's own figure go below zero**: rejected for Move
  Money, to keep one rule with the current month, where Move Money may leave
  Ready to Assign negative. It's kept for Auto-Assign, which already stops
  at zero.
- **Absorb overspending immediately** in the same month: rejected because
  it hides the red signal the user is meant to fix by moving money.
- **Snapshot each closed month** and apply later edits as an adjustment in
  the current month: rejected because it needs stored rollover state, a
  month-closing job and a reconciliation path, for no gain over recompute.

## Consequences

Every existing category's Available changes in every month after its first
overspend, and the budget page's historical numbers change when this
ships. Available can no longer be computed from two running-total sums. It
has to walk months in order per category, so the read path needs each
month's assigned and activity amounts, not only the totals.

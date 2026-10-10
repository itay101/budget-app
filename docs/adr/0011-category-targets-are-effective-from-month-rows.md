# Category targets are effective-from-month rows, with Underfunded derived at read time

A category's **Target** is stored as `CategoryTarget` rows, each starting at
a Budget Month, not as fields on `Category`:

```
CategoryTarget { categoryId, startMonth, kind, cadence, amount,
                 weekday?, dueDay?, dueDate? }   unique (categoryId, startMonth)
CategoryTargetSnooze { categoryId, month }       unique (categoryId, month)
```

- `kind` is `SET_ASIDE`, `REFILL`, `BALANCE` or `NONE`.
- `cadence` is `WEEKLY`, `MONTHLY` or `YEARLY`, and null for `BALANCE`.
- `amount` is in milliunits.

Month M uses the latest row whose `startMonth` is on or before M. Editing a
target while viewing month M upserts the row for M, so it takes effect from M
onwards and earlier months keep the target they had. Removing a target writes
a `NONE` row at M. Any category except Inflow: Ready to Assign can have a
target, Payment Categories included. On a Payment Category, a monthly Set
aside stands in for YNAB's "pay a specific amount each month".

v1 supports these targets:

- monthly, weekly or yearly, each either Set aside or Refill up to
- Have a balance of, dated or undated

Dates:

- **Monthly:** an optional `dueDay`, clamped to the month's last day, which
  only orders Auto-Assign and appears on screen.
- **Weekly:** a required `weekday`.
- **Yearly:** a required `dueDate` that repeats every year. A new cycle
  starts the day after it. Needs are worked out in whole Budget Months, so
  the cycle runs from the month after the due month through the next due
  month.
- **Dated balance:** a one-off due month.

**Underfunded** for month M is derived at read time, like Available
([ADR 0009](0009-category-available-resets-at-month-rollover-derived-from-full-history.md)).
Here `funded = max(0, Available carried in) + assigned(M)`. It leaves out this
month's spending, so spending doesn't reopen a need mid-month. Overspending is
handled separately.

| Target | Needed in month M |
|---|---|
| Monthly Set aside | amount − assigned(M) |
| Monthly Refill up to | amount − funded |
| Weekly | the monthly rule, with amount × the number of that weekday in M |
| Yearly | still to fund this cycle at the start of M ÷ months left to the due month (counting M), − assigned(M). For Refill up to, "still to fund" is amount − Available carried in. For Set aside, it's amount − what was assigned earlier this cycle, so last cycle's leftover doesn't count and spending mid-cycle doesn't reopen the need. |
| Balance, dated | (amount − Available carried in) ÷ months left to the due month, − assigned(M). Once the due month has passed, the whole remainder. |
| Balance, undated | amount − funded |
| Snoozed, `NONE` or no target | 0 |

- **Rounding:** every result has a floor of 0, and amounts split over months
  round up to the cent.
- **Plan-level Underfunded:** the sum over all categories, hidden ones
  included, plus the overspending to cover.
- **Cost to Be Me:** the sum of each target's monthly ask, which is the same
  rule before `assigned(M)` is subtracted. Undated balances are left out, and
  snoozed targets still count.
- **Next month's targets:** the same rule applied to M+1.

A snooze applies to any navigable month and wakes up automatically the
following month. Snoozes are stored apart from targets, so snoozing doesn't
start a new effective-from row. Following [ADR 0002](0002-audit-entry-is-a-single-polymorphic-table-with-field-diffs.md),
both tables get their own `AuditEntityType`, `CATEGORY_TARGET` and
`CATEGORY_TARGET_SNOOZE`, written through the `audited*` helpers.

## Considered Options

- **Target fields on `Category`**: rejected because editing a target would
  rewrite the Underfunded and Cost to Be Me of every past month, and every
  month can be navigated to and edited.
- **Rows with an `endMonth`**: rejected because each edit would touch two
  rows. A `NONE` row expresses removal with a single upsert.
- **A target copied onto every `CategoryMonth`**: rejected because it needs a
  row for every future month and fights the "latest on or before M" rule.
- **Mirroring YNAB's API fields** (`goal_type` NEED/TB/TBD/MF/DEBT,
  `goal_needs_whole_amount`, cadence frequency): rejected because v1 has no
  custom repeats or debt targets, and the explicit `kind` reads better.
- **Flat amortisation for yearly and dated targets** (amount ÷ 12): rejected
  because it doesn't catch up after underfunded months.

## Consequences

Past months keep their targets, so a month's Underfunded never changes after
the fact unless that month's own assignments or carry-in change. Adding custom
repeats or debt targets later means new `kind` or `cadence` values, not a new
table. The app has no scheduled transactions, so YNAB's "unfunded upcoming
transaction" part of Underfunded doesn't apply.

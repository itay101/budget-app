# How YNAB calculates Ready to Assign and cash overspending

Research for [#125](https://github.com/itay101/budget-app/issues/125) (parent map: #123).
Researched 2026-10-03.

## Sources and how they were read

| Tag | Source | Access |
|---|---|---|
| [HDR] | YNAB Help: [The Plan Header](https://support.ynab.com/en_us/the-plan-header-BkmiuJ_C9) | search-engine excerpt |
| [OVR] | YNAB Help: [Handling Overspending](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi) | search-engine excerpt |
| [NEG] | YNAB Help: [When Ready to Assign is Negative](https://support.ynab.com/en_us/when-ready-to-assign-is-negative-an-overview-HylZA0zCc) | search-engine excerpt |
| [AHEAD] | YNAB Help: [Getting a Month Ahead](https://support.ynab.com/en_us/getting-a-month-ahead-HJidy13C5) | search-engine excerpt |
| [CAT] | YNAB Help: [Adding, Removing, and Customizing Categories](https://support.ynab.com/en_us/adding-removing-and-customizing-categories-a-guide-HJFO5j909) | search-engine excerpt |
| [HIDDEN] | YNAB Help: [Can I see what hidden categories have money in them…](https://support.ynab.com/en_us/can-i-see-what-hidden-categories-have-money-in-them-without-adding-them-all-back-into-my-plan-SJgUwsw4Jl) | search-engine excerpt |
| [INC] | YNAB Help: [How to Add Income and Other Inflows](https://support.ynab.com/en_us/how-to-add-income-and-other-inflows-H1ZNjfZJi) | search-engine excerpt |
| [SB] | YNAB Help: [Starting Balances](https://support.ynab.com/en_us/the-starting-balance-an-overview-H1uozOfJs) | search-engine excerpt |
| [TRK] | YNAB Help: [Tracking Investment Accounts](https://support.ynab.com/en_us/tracking-investment-accounts-a-guide-r1Bzjxd05), [Changing an Account Type](https://support.ynab.com/en_us/changing-an-account-type-a-guide-HJRnSXWko) | search-engine excerpt |
| [API] | YNAB API OpenAPI spec, [`ynab/ynab-sdk-js` `open_api_spec.yaml` @ `5bed1a4`](https://github.com/ynab/ynab-sdk-js/blob/5bed1a47d332d6fa499a9bce65a9ecd8e381b196/open_api_spec.yaml) | read directly |

**Access caveat:** this session's network policy blocks `support.ynab.com`,
`www.ynab.com` and `api.ynab.com`, so the help-center pages were read through
search-engine excerpts of those exact pages, not fetched in full. The API spec
was read in full from YNAB's own SDK repo. Points marked **(inference)** are
my reasoning from the cited facts, not stated by YNAB.

## Answers

### 1. The formula and the breakdown lines

In the web app, clicking Ready to Assign opens a **Ready to Assign Breakdown**
split into "added to" and "deducted from" sections [HDR]:

Added:
- **Ready to Assign left over from [previous month]**: last month's rolled-over
  Ready to Assign *plus* any money that entered Ready to Assign last month or
  earlier and was assigned in a future month [HDR].
- **Inflow: Ready to Assign transactions in [current month]**: income, new
  starting balances on cash accounts added this month, positive credit-card
  balances from cash back, and inflows transferred from debt accounts [HDR].

Deducted:
- **Cash overspending in [past month]** [OVR].
- **Assigned in [current month]**: money assigned to categories this month [HDR].
- **Assigned in Future**: money available this month but set aside for future
  months, with a per-month breakdown; a red alert shows if any future month's
  Ready to Assign is negative [HDR].

So, for month *M*:

```
RTA(M) = leftover(M-1)            // RTA(M-1), incl. money already assigned in future months
       + inflowsToRTA(M)
       - cashOverspending(M-1)
       - assigned(M)
       - assignedInFuture(>M)
```

The API exposes the same pieces per month [API]: `income` ("total amount of
transactions categorized to 'Inflow: Ready to Assign' in the month"),
`budgeted` ("total amount assigned (budgeted) in the month"), `activity`
(all transactions *excluding* Inflow: Ready to Assign), and `to_be_budgeted`
("the available amount for 'Ready to Assign'"). All amounts are integer
milliunits, the same as `src/lib/money.ts`.

**(inference)** The "left over" line already adds back future assignments and
"Assigned in Future" subtracts them again, so the net effect is that money
assigned ahead stays out of the current month.

### 2. When cash overspending hits Ready to Assign

**At the next month boundary, not right away.** "When the month rolls over,
cash overspending (red) in the previous month reduces Ready to Assign" [OVR];
it shows up as "Cash overspending in [past month]" in the breakdown [OVR].
During the month itself, the overspent category is just shown red and
negative. Credit (yellow) overspending never touches Ready to Assign; it
turns into new card debt and an underfunded alert on the Credit Card
Payment category [OVR].

The category's Available goes back to zero in the new month (the deficit was
moved to Ready to Assign). **(inference)**: this matches the "reduces Ready to
Assign" wording plus the usual practice of fixing it by moving money back to
Ready to Assign [OVR].

### 3. How a negative Ready to Assign carries forward

A negative Ready to Assign means you assigned more than you have [NEG]. It
carries forward through the "left over from last month" line, which is just
last month's Ready to Assign [HDR], so a negative month lowers the next one.
Any income added while Ready to Assign is negative, in this month or any
future month, automatically covers the shortfall first [NEG]. The fix is to
move money from categories back to Ready to Assign in the **current** month
until it reaches $0.00 [OVR].

### 4. How assigning in future months affects the current month

- Money assigned in future months is subtracted from the current month as
  "Assigned in Future" [HDR].
- When you are a month ahead, "Ready to Assign is current in the future-most
  month", so the current month may *not* look negative even when you have
  over-assigned in the future [AHEAD][NEG].
- The current month can show $0.00 while a future month is negative: there is
  enough for this month's assignments but not for the future ones [NEG].
- If you assign more in the current month while money sits in a future month,
  YNAB takes it back from the future month for this month, which can leave
  that future month negative [NEG].

### 5. Hidden and deleted categories

- **Hidden:** hiding only removes the category from view. Its Available balance
  and activity stay in the plan and in reports (marked with an eye icon), and
  you have to unhide it to see what it holds [HIDDEN][CAT]. The API keeps a
  `hidden` flag on categories and category groups [API]. **(inference)** Since
  the money is still assigned to the category, hiding does not move it back to
  Ready to Assign.
- **Deleted, no transaction history:** any Available amount moves to Ready to
  Assign [CAT].
- **Deleted, with history:** you must pick a replacement category, and the
  transactions, assigned amounts and remaining Available are moved there [CAT].
  YNAB suggests hiding categories that have activity instead of deleting
  them [CAT]. The API soft-deletes (`deleted: true`, only returned in delta
  requests) [API].

### 6. Editing a past-month transaction after the month has ended

YNAB recalculates going forward. If an edit creates or increases cash
overspending in a past month, that overspending is carried into the next
month, so it lowers the **current** month's Ready to Assign (and can make it
negative). YNAB warns that "fixing" past months can have unintended effects on
current **and** future months, and says to fix things in the current month
instead of going back [NEG][OVR].

### 7. Which inflows count toward Ready to Assign

Counted:
- Transactions on budget accounts categorized **Inflow: Ready to Assign**
  (shown as "Income: Ready to Assign" on mobile; they are the same thing).
  Imported checking-account inflows get this category by default [INC]. The
  API's `income` field adds up exactly these [API].
- **Starting balances** of budget (cash) accounts: once added, "your money is
  ready and waiting in Ready to Assign" [SB][HDR].
- Positive credit-card balances from cash back, and inflows transferred in
  from debt accounts [HDR].

Not counted:
- **Tracking (off-budget) accounts:** their money "does not affect your plan"
  [TRK]. Switching a cash account to a tracking account removes its money from
  the plan and can make Ready to Assign lower or negative [TRK]. Accounts carry
  an `on_budget` flag in the API [API].
- Transfers *between budget accounts* do not count; they just move money
  between accounts [INC]. **(inference)** A transfer from a tracking account
  into a budget account comes into the plan as a categorized inflow, usually
  to Ready to Assign, while a transfer from a budget account to a tracking
  account needs a category, the same way an outflow does.

## Implications for budget-app

- Keep Ready to Assign as a per-month calculation using the five breakdown
  terms above, so the UI can show the same breakdown.
- Take cash overspending out at the month boundary (in month M+1), and only
  for red overspending in cash-funded categories. Credit overspending goes to
  card debt instead.
- When a future month has assignments, show Ready to Assign as of the
  furthest-ahead month, or at least flag negative future months.
- Hiding a category must not move its money. Deleting one either moves its
  Available to Ready to Assign (no history) or reassigns it (with history).
- Only inflows on on-budget accounts categorized to Ready to Assign (plus
  starting balances) should count toward income. Off-budget accounts are
  excluded.

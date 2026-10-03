# How YNAB's Auto-Assign works

Research for [#128](https://github.com/itay101/budget-app/issues/128) (map: [#123 Ready to Assign & Overspending](https://github.com/itay101/budget-app/issues/123)).
Researched 2026-10-03.

## Sources

Everything here comes from YNAB's own help center and API docs. Third-party write-ups were not used for any claim.

| Key | Source |
|---|---|
| [AA] | YNAB Help Center, *How to Use Auto-Assign in YNAB*: https://support.ynab.com/en_us/auto-assign-a-guide-r1gBNbBJo |
| [UF] | YNAB Help Center, *Underfunded: A Guide*: https://support.ynab.com/en_us/underfunded-a-guide-BJwPhQO09 |
| [HDR] | YNAB Help Center, *The Plan Header in YNAB*: https://support.ynab.com/en_us/the-plan-header-BkmiuJ_C9 |
| [INSP] | YNAB Help Center, *The Inspector in YNAB*: https://support.ynab.com/en_us/the-inspector-an-overview-ryylY7OCq |
| [TGT] | YNAB Help Center, *How to Use Targets in YNAB*: https://support.ynab.com/en_us/how-to-use-targets-rk5kkI9ks |
| [API] | YNAB API reference, `Category.goal_under_funded`: https://api.ynab.com/v1 |

> **How these were read.** This sandbox's egress proxy blocks `support.ynab.com`, `www.ynab.com` and `api.ynab.com`, so I couldn't fetch the pages directly. Each claim below comes from YNAB's own article text, as quoted in search-engine extracts of those exact URLs. I quote YNAB's wording wherever an extract gave it. Points that are only partly documented are marked **(unverified)**. Re-check them against the live pages before you lock in behavior that depends on them.

## TL;DR

- Auto-Assign is a set of one-click presets. Each one fills the **Assigned** column for the current month from a formula: Underfunded, Assigned Last Month, Spent Last Month, Average Assigned, Average Spent and Reduce Overfunding, plus **Reset Available Amount** and **Reset Assigned Amount** (web only). [AA]
- It applies to **the whole plan when nothing is selected**. If you select specific categories or category groups, it applies **only to that selection**. On a single category, the Inspector shows the same presets for that category alone. [AA][INSP]
- **Underfunded** and **Reduce Overfunding** depend on targets (and scheduled transactions). The history-based options (Last Month, Averages) and the Resets do not. [AA][TGT]
- When Ready to Assign can't cover everything, Underfunded funds in **priority order**: targets due in the future come before targets whose due date has already passed. Auto-Assign is offered only while Ready to Assign is positive, and it shows an editable preview before you save. [AA][HDR]

## 1. The options and how each calculates its amount

All amounts apply to the **current (viewed) month's Assigned** value of each category in scope. The result is shown as a preview. You confirm it with **Save Assignments**, and you can adjust individual categories in the preview first. [AA]

| Option | What it sets Assigned to | Inputs | Source |
|---|---|---|---|
| **Underfunded** | Enough to fund each category's targets "in their order of priority, in addition to covering upcoming transactions and overspending." In other words, it adds each category's *Underfunded* amount. | Targets, scheduled (upcoming) transactions, negative Available (overspending) | [AA][UF] |
| **Assigned Last Month** | The same Assigned amount as the previous month ("Some assigned amounts don't change month-to-month"). | Previous month's Assigned | [AA] |
| **Spent Last Month** | The previous month's spending (Activity) in that category ("If the previous month's spending was a pretty good template for the current month…"). | Previous month's Activity | [AA] |
| **Average Assigned** | "A rolling average of the assigned value for this category up to the last 12 months. Average Assigned starts from the first month you assigned money to this category, and the current month's plan is excluded." Example: in plan month 4, for a category first assigned in month 2, it averages months 2 and 3. | Assigned in up to the 12 prior months | [AA] |
| **Average Spent** | "An average of up to the last 12 months (excluding the current month), starting from the first month in which you assigned or spent money during that 12-month period." | Activity in up to the 12 prior months | [AA] |
| **Reduce Overfunding** | Removes the excess in categories that have "more money assigned towards them than they need according to the targets and scheduled transactions in that category" and sends it back to Ready to Assign. It shows up only when something is overfunded. | Targets, scheduled transactions | [AA] |
| **Reset Available Amount** *(web only)* | Moves each category's Available back to Ready to Assign, which lets you "re-prioritize every single dollar." YNAB advises against using it on future months because it can cause overspending. | Current Available | [AA] |
| **Reset Assigned Amount** *(web only)* | Sets the Assigned column to **0** for the month. | (none) | [AA] |

Notes on the calculations:

- **Average windows start at first use.** Neither average divides by a fixed 12. Each one begins at the first month with activity in that category (assigned for Average Assigned; assigned *or* spent for Average Spent) and covers at most the last 12 complete months. [AA]
- **What "Underfunded" means.** It's the same per-category number YNAB shows as *Underfunded*: the amount still needed this month to stay on track for the target. The API exposes it as `goal_under_funded`, described as "the amount of funding still needed in the current month to stay on track towards completing the goal within the current goal period". The API notes that this "will generally correspond to the 'Underfunded' amount in the web and mobile clients except when viewing a category with a Needed for Spending Goal in a future month." [API]
- **Snoozed targets** are left out of Underfunded: "snooze the target to exclude it from the monthly 'needed' amount that shows up in Underfunded". The target becomes active again next month. [TGT][UF]
- **Credit Card Payment categories** can be Underfunded too. Their Inspector shows a *Total Underfunded* breakdown by source. [UF]

## 2. Scope: all categories, a group, or a selection

- **Whole plan.** On the web, you get the plan-wide Auto-Assign by making sure **no categories are selected**. You reach it from the Inspector's Auto-Assign heading in the right sidebar, or from the **Assign** button next to Ready to Assign (*Auto* tab). On iOS you tap the Ready to Assign banner. [AA][HDR]
- **Selection.** If you select specific categories and/or category groups (selecting a group's checkbox selects its categories), Auto-Assign is limited to that selection: "use Underfunded for all the categories at once or by selecting specific Categories/Category Groups and funding those in bulk." [AA]
- **Single category.** Selecting one category shows its Auto-Assign values in the Inspector, so you can apply one preset to just that category. [INSP]

So the answer is all three: the whole plan, one or more groups, or any selection of categories.

## 3. When Ready to Assign can't cover the full amount

- **Availability gate.** The Auto-Assign preview "is only available if you have a green Ready to Assign header (or funds available to assign)". On Android, Auto-Assign options appear only when funds are available to assign. [AA][HDR]
- **Priority order (Underfunded).** Underfunded funds targets "in their order of priority", and "Auto-Assign will prioritize targets that are due in the future before funding targets where the due date has already passed." YNAB points to [UF] for the full ordering rules. [AA][UF]
- **Partial funding (unverified).** The extracts I could reach don't state outright that Underfunded stops once Ready to Assign reaches zero. Together, the priority order, the "only when funds available" gate and YNAB's guidance ("if you don't have enough for the entire month at once, assign dollars where you need them the most first") suggest that it fills categories in priority order until the money runs out, leaving later ones partly funded or unfunded. Check this against [UF]'s ordering section before you rely on it.
- **History-based presets (unverified).** None of the sources say whether Assigned Last Month, Spent Last Month or the Averages are capped at Ready to Assign. They're defined purely as formulas over history. If they aren't capped, applying them could push Ready to Assign negative, which YNAB treats as the separate "Ready to Assign is negative" state ([When Ready to Assign is Negative](https://support.ynab.com/en_us/when-ready-to-assign-is-negative-an-overview-HylZA0zCc)).
- **Escape hatch.** You can edit the preview before saving, so you can drop or trim categories when the total is too high. [AA]

## 4. Which options depend on targets

| Depends on targets | Doesn't depend on targets |
|---|---|
| **Underfunded**: targets plus scheduled transactions and overspending | Assigned Last Month |
| **Reduce Overfunding**: compares Assigned with what targets and scheduled transactions need | Spent Last Month |
| | Average Assigned |
| | Average Spent |
| | Reset Available Amount |
| | Reset Assigned Amount |

Without targets, Underfunded still covers overspending and upcoming scheduled transactions. It just has no target amount to fill. [AA][UF]

## Implications for budget-app

- Each preset is a pure function of `(category, month, history, targets, scheduled txns) -> proposed assigned delta` in milliunits. Previewing and then saving fits a single server action that writes all the deltas in one transaction, plus audit entries (ADR 0002).
- Scope = all categories when the selection is empty, otherwise the selected categories (groups expand to their categories).
- Only Underfunded and Reduce Overfunding need a target model. The four history presets and the two resets can ship without targets.
- Decide explicitly whether presets are capped at Ready to Assign, and in what priority order. YNAB's documented rule is future-due targets before past-due targets.

## Open questions

1. The exact Underfunded ordering beyond "future-due before past-due" (e.g. by target type or by category order in the plan). See [UF].
2. Whether the non-target presets clamp to Ready to Assign or can make it negative.

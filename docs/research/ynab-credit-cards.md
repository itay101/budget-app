# How YNAB handles credit-card accounts and credit overspending

Research for [#126](https://github.com/itay101/budget-app/issues/126) (parent map: #123, Ready to Assign & Overspending). Researched 2026-10-03.

## Sources and how they were read

- **YNAB Help Center** (`support.ynab.com`): the first-party behavioural docs. The research sandbox's egress proxy blocked direct fetches of `support.ynab.com`, `www.ynab.com` and `api.ynab.com`, so help-center claims below come from search-engine excerpts of those exact pages, scoped to `support.ynab.com`. Each claim links the page it came from. Re-read the linked page before relying on exact wording.
- **YNAB API OpenAPI spec**: read directly from `open_api_spec.yaml` in the official [`ynab/ynab-sdk-js`](https://github.com/ynab/ynab-sdk-js/blob/5bed1a47d332d6fa499a9bce65a9ecd8e381b196/open_api_spec.yaml) repo (commit `5bed1a4`, 2026-09-30). This is the same spec that api.ynab.com publishes.

## 1. Credit Card Payment categories: when they are created, what they hold

- Adding a credit-card account automatically creates a **Credit Card Payment category** paired with it, in the **Credit Card Payments** category group. This also happens when the card is added with an existing balance. ([Paying Down a Credit Card Balance Over Time](https://support.ynab.com/en_us/paying-down-a-credit-card-balance-over-time-SkWj0Ls8Me), [Glossary](https://support.ynab.com/en_us/ynab-glossary-a-guide-BJd80SORq))
- Its **Available** amount is the money already set aside to pay the card company. If Available equals the card balance the category shows green ("fully funded"). If it is short, it shows yellow (underfunded). ([Targets for Categories Paired with Accounts](https://support.ynab.com/en_us/paired-targets-BJJI8rdC5), [How to Do Credit Cards in YNAB](https://www.ynab.com/blog/how-to-do-credit-cards-in-ynab))
- Its **Activity** is the sum of money coming in through **funded spending**, minus money going out through **payments**. ([Credit Card Activity](https://support.ynab.com/en_us/credit-card-activity-an-overview-Sk2mLluA9))
- You can assign money to it directly, the same as any category, to cover old debt. It has two card-specific target types: pay a set amount each month, or pay off the balance by a date. ([Paired targets](https://support.ynab.com/en_us/paired-targets-BJJI8rdC5))
- API (spec): the payment category is a system-managed category, and **transactions cannot be categorized to it**. For `category_id` the spec says *"Credit Card Payment categories are not permitted and will be ignored if supplied."* This applies to both transactions and subtransactions. A goal on it defaults to `NEED` or `MF` (monthly funding). Categories have an `internal` flag, and an internal category group cannot be chosen when creating a category.

## 2. How a card purchase moves money from the spending category to the payment category

- When you spend on the card in a category that has enough Available, YNAB **automatically moves that amount** from the spending category to the card's payment category. The help center's example: a $33 purchase moves $33 from the spending category to the Credit Card Payment category. ([Credit Cards – Funded Spending](https://support.ynab.com/en_us/credit-cards-funded-spending-By7XIs8HMg))
- "Funded Spending" is defined as card spending that had enough cash Available in its category to cover it, so the money moved to the payment category. If Funded Spending is less than Spending, the cause is either credit overspending this month or a card that had a positive balance at some point. ([Credit Card Activity](https://support.ynab.com/en_us/credit-card-activity-an-overview-Sk2mLluA9))
- **Partial funding:** only the covered portion moves. The uncovered remainder is credit overspending (see §3).
- **Card with a positive balance** (overpaid or credited): the positive amount counts toward Ready to Assign. A purchase made against that positive balance moves **nothing** to the payment category, because there is nothing to pay back. If that spending is unfunded, it shows as **cash** overspending (red), not credit overspending (yellow). ([Credit Cards with a Positive Balance](https://support.ynab.com/en_us/credit-cards-with-a-positive-balance-an-overview-By_H6uzJo))

## 3. Credit overspending vs cash overspending

| | Cash overspending | Credit overspending |
|---|---|---|
| Cause | Overspent from a cash (checking/savings/cash) account | Card purchase not fully covered by the category's Available |
| Colour | Red | Yellow |
| Payment category | n/a | The unfunded part is **not** moved to the payment category |
| At month rollover (if uncovered) | **Deducted from next month's Ready to Assign** | **Not** deducted from Ready to Assign; it stays as card debt the payment category does not cover (the card balance exceeds the payment category's Available) |
| Covering it this month | Move money into the category | Move money into the category. The yellow alert clears, and the covered amount **automatically moves on to the payment category** |

Sources: [Handling Overspending in YNAB](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi), [Credit Card Activity](https://support.ynab.com/en_us/credit-card-activity-an-overview-Sk2mLluA9), [Colors and Icons](https://support.ynab.com/en_us/colors-and-icons-in-your-plan-HJQv_XHko). The help center's wording is that uncovered credit overspending "increases the credit card balance when the month rolls over", leaving "more debt to plan for in the Credit Card Payment category". In practice this means the spending category resets to 0 next month, and the payment category is underfunded by that amount. YNAB also documents **intentional** credit overspending as a deliberate way to take on debt ([Intentional Credit Card Overspending](https://support.ynab.com/en_us/intentional-credit-card-overspending-an-overview-HJrSQbOC9)).

## 4. Payments, refunds/returns, existing balances

- **Payments:** a payment is a **transfer** from a cash budget account to the card account. A transfer between two on-budget accounts needs no category. The payment lowers the payment category's Available (Activity goes negative) and lowers the card's debt. If a payment imports as two unlinked transactions, you set the checking outflow's payee to the transfer payee, and in the category picker that appears under **Credit Card Payments** as the card. ([Imported Credit Card Payments](https://support.ynab.com/en_us/how-to-handle-imported-credit-card-payments-SkXcoodci), [Transfer Transactions](https://support.ynab.com/en_us/transfer-transactions-a-guide-HJOsZz4Jj), [Credit Card Activity](https://support.ynab.com/en_us/credit-card-activity-an-overview-Sk2mLluA9)). The API represents this with `transfer_account_id`, and each account has a `transfer_payee_id`.
- **Refunds/returns:** categorize the refund inflow back to the **original spending category**, not to Ready to Assign. This reverses the purchase: money moves **from the payment category back to the spending category**. If the payment category goes negative (for example, the card was already paid off between the purchase and the return), move the money back into the payment category from the spending category. ([Credit Card Refunds and Returns](https://support.ynab.com/en_us/credit-card-refunds-and-returns-H1J7qDWkj))
- **Cash advances** (card → cash transfer): money leaves the card, enters the cash account and **increases Ready to Assign**. The payment category does not change, so to avoid creating new unplanned debt you assign that amount to the payment category. ([Cash Advances](https://support.ynab.com/en_us/credit-card-cash-advances-an-overview-Hy6PmlOC9))
- **Existing balances** (debt you already had when adding the card): the card is created with a negative starting balance, and the new payment category starts **underfunded** (yellow) because nothing was set aside for that debt. This prior debt does **not** reduce Ready to Assign. You pay it down by assigning money to the payment category, usually with a "pay specific amount monthly" target. ([Paying Down a Credit Card Balance Over Time](https://support.ynab.com/en_us/paying-down-a-credit-card-balance-over-time-SkWj0Ls8Me), [Credit to Cash Roadmap](https://support.ynab.com/en_us/the-credit-to-cash-roadmap-r11FgcqJx))

## 5. Lines of credit and loan accounts

- **Line of Credit** (a budget/"Plan" account type, API `lineOfCredit`): use it when you spend directly from the LOC/HELOC on categorized purchases. It gets a payment category in the Credit Card Payments group and **acts exactly like a credit card**. ([Line of Credit Accounts](https://support.ynab.com/en_us/line-of-credit-accounts-a-guide-S10LHsqkl))
- **Loan accounts** (API `mortgage`, `autoLoan`, `studentLoan`, `personalLoan`, `medicalDebt`, `otherDebt`): these are a separate account class. Spending does not flow through them, so there is no automatic money movement or credit overspending. You can optionally **pair** a regular category for payments, which can then only be used for payments to that loan. A payment is a transfer from a cash account to the loan, and that transfer **needs a category**, because money is leaving the plan. ([Loan Accounts](https://support.ynab.com/en_us/loan-accounts-a-guide-HkNSkPHJi), [Account Types](https://support.ynab.com/en_us/account-types-an-overview-BkmGM0qCq), [Transfer Transactions](https://support.ynab.com/en_us/transfer-transactions-a-guide-HJOsZz4Jj))
- API (spec): `AccountType` = `checking, savings, cash, creditCard, lineOfCredit, otherAsset, otherLiability, mortgage, autoLoan, studentLoan, personalLoan, medicalDebt, otherDebt`. Only `checking, savings, cash, creditCard, otherAsset, otherLiability` can be **created** via the API (`SaveAccountType`). Loan accounts carry `debt_interest_rates`, `debt_minimum_payments` and `debt_escrow_amounts` as date-keyed maps (`LoanAccountPeriodicValue`). Their transactions carry `debt_transaction_type` ∈ `payment, refund, fee, interest, escrow, balanceAdjustment, credit, charge`. Category goal types include `DEBT`.

## Implications for budget-app (non-binding notes)

- Model the payment category as a **system category owned by the card account**: created alongside the account, not user-categorizable, and placed in a reserved group.
- On a card outflow in category C, move `min(max(Available_C, 0), amount)` from C to the payment category, in milliunits. The rest is credit overspending, and at rollover it must **not** come out of Ready to Assign. Cash overspending does come out of Ready to Assign.
- Refunds are the reverse move. Payments are uncategorized transfers that reduce the payment category. Opening balances on a card create debt without affecting Ready to Assign.
- Some edge cases are worth deciding explicitly: positive card balances, and covering overspending later in the month (which retroactively moves money to the payment category).

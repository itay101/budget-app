# How YNAB targets, Underfunded and Cost to Be Me work

Research for [#127](https://github.com/itay101/budget-app/issues/127) (child of map #123, "Ready to Assign & Overspending").
Researched 2026-10-03.

## Sources and how they were read

| Tag | Source | Trust |
|---|---|---|
| **API** | YNAB API OpenAPI spec v1.85.0, `open_api_spec.yaml` in [ynab/ynab-sdk-js](https://github.com/ynab/ynab-sdk-js/blob/main/open_api_spec.yaml) (commit `5bed1a4`, 2026-09-30). Read in full. | First-party, machine contract |
| **GS** | [Getting Started with Targets](https://support.ynab.com/en_us/getting-started-with-targets-ryAEP08xC) | First-party help center |
| **HU** | [How to Use Targets](https://support.ynab.com/en_us/how-to-use-targets-rk5kkI9ks) | First-party help center |
| **UF** | [Underfunded: A Guide](https://support.ynab.com/en_us/underfunded-a-guide-BJwPhQO09) | First-party help center |
| **AA** | [How to Use Auto-Assign](https://support.ynab.com/en_us/auto-assign-a-guide-r1gBNbBJo) | First-party help center |
| **EP** | [Plan and Adjust with Edit Plan and Cost to Be Me](https://support.ynab.com/en_us/edit-plan-ByR7vpqPyx) | First-party help center |
| **PT** | [Creating a Plan Template](https://support.ynab.com/en_us/creating-a-plan-template-ByZJZx_R9) | First-party help center |
| **IN** | [The Inspector in YNAB](https://support.ynab.com/en_us/the-inspector-an-overview-ryylY7OCq) | First-party help center |
| **CI** | [Colors and Icons in Your Plan](https://support.ynab.com/en_us/colors-and-icons-in-your-plan-HJQv_XHko) | First-party help center |
| **PB** | [Visual Progress Bars](https://support.ynab.com/en_us/progress-bars-a-guide-SkDEhot09) | First-party help center |
| **PA** | [Targets for Categories Paired with Accounts](https://support.ynab.com/en_us/paired-targets-BJJI8rdC5), [Paying Down a Credit Card Balance Over Time](https://support.ynab.com/en_us/paying-down-a-credit-card-balance-over-time-SkWj0Ls8Me), [Loan Accounts](https://support.ynab.com/en_us/loan-accounts-a-guide-HkNSkPHJi) | First-party help center |
| **SZ** | [Now You Can Choose to Snooze](https://www.ynab.com/whats-new/now-you-can-choose-to-snooze) | First-party release note |
| **MA** | [Getting a Month Ahead](https://support.ynab.com/getting-a-month-ahead-HJidy13C5) | First-party help center |

**Caveat on access:** this sandbox's egress proxy blocks `support.ynab.com` and `ynab.com`, so the help-center articles could not be fetched in full. Their content was read through search-engine excerpts of those exact pages. The API spec was read in full. Claims marked **(inferred)** are my synthesis. They follow from the cited text, but no source states them word for word. Re-check them against the live articles before building on them.

---

## 1. Target types and options

### Cadences (GS, HU)

| Cadence | What it asks for |
|---|---|
| **Weekly** | "Assign and spend up to this amount each week." You pick the day the week "starts over". The monthly ask is the amount × the number of those weekdays in the month, so a five-Friday month asks for more (GS, HU). |
| **Monthly** | A fixed amount every month, optionally due by a day of the month (GS; API `goal_day` 1–31, null = last day). |
| **Yearly** | An amount "By" a chosen date. The date drives the monthly ask: $600 for taxes due in a year asks for $50 per month (GS, HU). |
| **Custom** | An amount by a date, which can repeat weekly, monthly, yearly or on a custom interval (GS). In the API, cadence values 3–12 mean every 2–11 months and 14 means every 2 years (API `goal_cadence`). |

### Behaviours (what happens when the period rolls over)

- **"Set aside another …"**: asks for the full target amount again each period, *even if last period's money rolled over unspent*. Money builds up in the category. Use it for bills, subscriptions and sinking funds (GS, HU).
- **"Refill up to …"**: asks only to replace what was spent or unassigned last period, up to the target amount. Rolled-over money counts toward the target. Use it for groceries, dining out and similar categories (GS, HU).
- **"Have a balance of …"** (custom targets only): a savings balance. You are "not meant to spend from it until the end of the target period". It **cannot repeat**. It can be dated or undated (HU, MA).
- Repeating is allowed for "Set aside" targets but **not** for "Have a balance of" targets (HU).

### How the API names these (API, `Category` schema)

| `goal_type` | API label | UI equivalent (inferred) |
|---|---|---|
| `NEED` | "Plan Your Spending" | Weekly, monthly, yearly and custom spending targets. `goal_needs_whole_amount=true` means **Set aside**; `false` means **Refill up to**. |
| `TB` | "Target Category Balance" | Custom "Have a balance of", undated |
| `TBD` | "Target Category Balance by Date" | Custom "Have a balance of", dated |
| `MF` | "Monthly Funding" | Legacy fixed monthly contribution, and the default for credit-card categories |
| `DEBT` | (enum value only) | Debt-payment target on a paired loan category |

Other target fields in the API:

- `goal_target` (milliunits) and `goal_target_date`
- `goal_cadence` and `goal_cadence_frequency`, where repeat = cadence × frequency
- `goal_day` (weekday 0–6 for weekly targets, day of month otherwise)
- `goal_creation_month`
- `goal_snoozed_at`

### Debt targets (PA)

- **Credit Card Payment categories** offer two targets:
  - "Pay Specific Amount Each Month"
  - "Pay off Balance by Date", which computes the monthly amount needed to clear the balance by the chosen date.
- **Loan categories** (paired with a loan account) get a **Monthly Debt Payment** target with a payoff calculator and a "Record Payment" button.

### Snooze (SZ, CI)

- Snoozing a target stops its underfunded alert **for the rest of the current month**. The target wakes up automatically when the next month starts.
- While a target is snoozed, you are not asked to assign more to it this month, and it is excluded from the monthly "needed" amount in Underfunded.
- A snoozed category shows green.
- A snoozed category can still show yellow if a **scheduled transaction** this month is unfunded.
- **Credit card targets can't be snoozed.**
- The API exposes the snooze time as `goal_snoozed_at`.

## 2. How Underfunded and "needed this month" are calculated

**Per category.** API `goal_under_funded` is "the amount of funding still needed in the current month to stay on track towards completing the goal within the current goal period", and it "will generally correspond to the 'Underfunded' amount in the web and mobile clients". There is one documented exception: for a NEED target viewed in a future month, the clients ignore funding from a prior goal period (API). Related fields:

- `goal_overall_funded`: funded so far in the current period.
- `goal_overall_left`: still needed to finish the period.
- `goal_months_to_budget`: months left in the period, including the current month.
- `goal_percentage_complete`

**Per type (inferred from GS, HU and the API fields):**

- **Set aside, monthly:** this month's need = target − assigned this month. Rollover does not count.
- **Refill up to, monthly:** this month's need = target − available (rollover counts), floored at 0.
- **Weekly:** as above, but the monthly target = amount × the number of the chosen weekday in the month.
- **Yearly, or custom dated:** the remainder is spread evenly over the remaining months. In API terms: (`goal_overall_left` + this month's assigned) ÷ `goal_months_to_budget` − assigned this month. HU says the target "take[s] into account any currently available funds in the category and prompt[s] you to assign the remaining target amount by the due date".
- **Have a balance of, dated (TBD):** the same spread over months as yearly.
- **Have a balance of, undated (TB):** the whole remaining balance (target − available) is shown as needed. It is excluded from Total Targets (PT) and from month-ahead calculations (MA).
- **Debt, pay a specific amount:** behaves like a monthly target.
- **Debt, pay off by date:** balance ÷ months remaining.
- **Snoozed:** 0 this month.

**Plan-level Underfunded (UF, AA, CI):** "the sum of targets that haven't been fully funded as well as overspending you need to address in the current month". Auto-Assign → Underfunded:

- funds targets **in priority order**,
- also covers upcoming scheduled transactions and overspending,
- funds targets due in the future before targets whose due date has already passed (AA, CI).

A category is yellow/underfunded when either (a) you've overspent on a credit account, or (b) you haven't assigned enough for an upcoming transaction or target to fund it by its due date (CI).

## 3. Status labels and progress bars (CI, PB, IN)

- **Funded / On Track (green):** at least one of these is true:
  - the target is fully funded for the month,
  - the target is snoozed,
  - the category has no target but has money available.

  "On track" also requires that the Available amount covers upcoming scheduled transactions. A full green pie icon means the target is met (CI, PB).
- **Underfunded (yellow):** money is assigned but the target isn't met. A partly filled pie icon appears. Selecting the category shows "how much more is needed to be fully funded for the month" in the Inspector (CI).
- **Overspent (red):** spending exceeds Available. A partly red bar shows the overspent amount (PB, CI).
- **Bar anatomy (PB):** the bar is the target, filled by funding. Light (striped "candy-cane") shading shows money **spent** and the darker solid portion shows money **still available**. Both use the bar's status colour: green when funded, yellow when underfunded. Progress bars can be turned on or off under Display Options.
- The exact UI label strings, such as whether "On Track" and "Funded" are separate words in the Inspector, could not be verified verbatim through the blocked pages. The colour semantics above are sourced.

## 4. Cost to Be Me, Total Monthly Targets, Next month's targets, Expected Income (EP, IN, PT)

- **Cost to Be Me** lives in the Inspector and in Edit Plan. It "calculates and displays the money you need to fully fund the current month based on this month's targets". YNAB "add[s] up all your targets and display[s] the total stacked up against your expected income" (EP, IN).
- **Total (Monthly) Targets:** the sum of all targets' monthly amounts. It "includes all targets except for undated custom targets with the 'Have a balance of…' option" (PT). (Inferred: it is the sum of each target's full monthly need, regardless of what is already assigned. Underfunded is what remains after assignments.)
- **Next month's targets:** a preview of next month's total. It is shown **only when next month's total is higher than this month's**, because the need varies, for example with weekly targets in five-week months (EP).
- **Expected Income:** a number **the user types** into Edit Plan or Cost to Be Me covering all expected income for the month. It is **not derived from transactions**, and is used to check whether income covers the total (EP, IN). By contrast, the API's month `income` is computed: "the total amount of transactions categorized to 'Inflow: Ready to Assign' in the month" (API `MonthDetail.income`).
- Edit Plan also suggests target amounts based on past spending (EP).

## Implications for budget-app

- Model a target as `{type: NEED|TB|TBD|MF|DEBT, amountMilli, targetDate?, cadence, cadenceFrequency, day?, needsWholeAmount?, snoozedAt?}`. This mirrors the API exactly and keeps amounts in milliunits (consistent with `src/lib/money.ts`).
- Underfunded should be a derived, per-month value per category. Plan-level Underfunded = Σ category underfunded (excluding snoozed targets) + overspending to cover.
- Expected Income is stored user input per month, not a computed value.

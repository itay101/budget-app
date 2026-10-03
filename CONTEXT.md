# Budget App

A personal, YNAB-style budgeting app: budgets, accounts, categories, and
transactions, shared between an owner and invited collaborators.

## Language

**User**:
An authenticated identity that can own and/or collaborate on one or more
Budgets. Introduced alongside authentication; the app had no notion of a
user before. Account-deletion constraints on Budgets they own: [ADR 0004](docs/adr/0004-ownership-transfer-preserves-access-account-deletion-blocks-on-owned-budgets.md).
"Deleting your account" deactivates the User (a timestamp, never a row
removal) while truly deleting the underlying Supabase credentials; exact
schema and mirroring trigger: [ADR 0005](docs/adr/0005-user-invite-budgetmembership-schema-is-locked-users-deactivate-not-delete.md).
_Avoid_: implying account deletion removes the User row — it doesn't.

**Owner**:
The single User a Budget belongs to (`Budget.ownerId`), with exclusive
rights to invite/remove Collaborators, transfer ownership, and delete the
Budget. Every Budget has exactly one Owner at a time; ownership can be
transferred to an existing Collaborator ([ADR 0004](docs/adr/0004-ownership-transfer-preserves-access-account-deletion-blocks-on-owned-budgets.md)).
_Avoid_: Admin (not used — there's no role above Owner).

**Collaborator**:
A User, other than the Owner, granted access to read and edit a Budget's
accounts, categories, and transactions. Recorded as a row in
BudgetMembership. There is currently only one kind of Collaborator access
(full read/write) — no view-only or per-resource variants.
_Avoid_: Member, Editor, Viewer (no such distinction exists yet).

**BudgetMembership**:
The fact that a specific User is a Collaborator on a specific Budget.
Does not include the Owner — the Owner relationship lives on
`Budget.ownerId`, not as a BudgetMembership row. Carries no role: presence
in this table means "collaborator," full stop. Removal/leave mechanics:
[ADR 0004](docs/adr/0004-ownership-transfer-preserves-access-account-deletion-blocks-on-owned-budgets.md).
Exact fields/indexes: [ADR 0005](docs/adr/0005-user-invite-budgetmembership-schema-is-locked-users-deactivate-not-delete.md).

**Invite**:
A pending, email-addressed request for someone to become a Collaborator
on a Budget, created by an Owner, converted into a BudgetMembership by a
sign-in with that email. Single-use. Resend / revoke / existing-account /
expiry mechanics: [ADR 0003](docs/adr/0003-invite-resend-and-existing-account-invites-route-around-a-non-idempotent-invite-api.md).
An Invite row's existence *is* "pending" — there's no status field; both
acceptance and cancellation delete the row outright. Exact fields/indexes:
[ADR 0005](docs/adr/0005-user-invite-budgetmembership-schema-is-locked-users-deactivate-not-delete.md).
_Avoid_: Invitation (either is fine informally, but "Invite" is the noun
used in code/schema).

**AuditEntry**:
A record that a User made a specific change to a Budget's data — scoped
to a Budget, covering every Budget-scoped mutation (not just
transactions). Data model, actor, and retention rules: [ADR 0002](docs/adr/0002-audit-entry-is-a-single-polymorphic-table-with-field-diffs.md).
_Avoid_: Audit log (that's the collection; AuditEntry is one row in it).

**Budget Month**:
The calendar month (in UTC) that the budget view shows assignments and
activity for. Every assignment belongs to exactly one Budget Month, and
every Budget Month can be edited, past and future alike. Edits to an
earlier month carry forward into later months.
_Avoid_: Period, cycle (budgeting is strictly monthly).

**Transfer**:
A movement of money from one Account in a Budget to another, recorded as
two linked transactions, one in each Account, with opposite amounts. A
Transfer between two on-budget Accounts carries no category. When one side
is off-budget, the on-budget side is categorized like ordinary spending or
income. Storage and editing rules: [ADR 0007](docs/adr/0007-transfers-are-paired-self-linked-transactions-and-on-budget-locks-once-used.md).
_Avoid_: Move (that's moving money between categories, not accounts), transfer payee

**Ready to Assign**:
Money in a Budget that has come in as income but isn't assigned to any
category yet. Income means an on-budget transaction categorized
**Inflow: Ready to Assign**, a system category that exists in every Budget
and can't be assigned to. Rules: [ADR 0008](docs/adr/0008-ready-to-assign-income-is-a-system-category.md).
_Avoid_: To Be Budgeted, unassigned, income category

**Uncategorized**:
An on-budget transaction that isn't a Transfer and has no category yet. It
counts as neither income nor spending in any real category until the user
categorizes it. The budget page totals these in their own Uncategorized row.
_Avoid_: implying uncategorized inflows are Ready to Assign income, because they aren't.

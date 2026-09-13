# Budget App

A personal, YNAB-style budgeting app: budgets, accounts, categories, and
transactions, shared between an owner and invited collaborators.

## Language

**User**:
An authenticated identity that can own and/or collaborate on one or more
Budgets. Introduced alongside authentication; the app had no notion of a
user before.

**Owner**:
The single User a Budget belongs to (`Budget.ownerId`), with exclusive
rights to invite/remove Collaborators, transfer ownership, and delete the
Budget. Every Budget has exactly one Owner at a time; ownership can be
transferred to an existing Collaborator.
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
in this table means "collaborator," full stop.

**Invite**:
A pending, email-addressed request for someone to become a Collaborator
on a Budget, created by the Owner before the invitee has an account. The
invitee's first sign-in with that email converts the Invite into a
BudgetMembership.
_Avoid_: Invitation (either is fine informally, but "Invite" is the noun
used in code/schema).

**AuditEntry**:
A record that a User made a specific change to a Budget's data (e.g. an
edited Transaction, a changed budgeted amount). Scoped to a Budget;
exists so an Owner or Collaborator can see who changed what.
_Avoid_: Audit log (that's the collection; AuditEntry is one row in it).

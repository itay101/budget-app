# Budget App

A personal, YNAB-style budgeting app: budgets, accounts, categories, and
transactions, shared between an owner and invited collaborators.

## Language

**User**:
An authenticated identity that can own and/or collaborate on one or more
Budgets. Introduced alongside authentication; the app had no notion of a
user before. Deleting a User's account is blocked while they still own
any Budget that has Collaborators — they must transfer or delete each
such Budget first (see [ADR 0004](docs/adr/0004-ownership-transfer-preserves-access-account-deletion-blocks-on-owned-budgets.md));
a Budget they own outright (no Collaborators) is soft-deleted
automatically as part of account deletion, and every BudgetMembership
where they're a Collaborator is deleted immediately, the same as leaving.

**Owner**:
The single User a Budget belongs to (`Budget.ownerId`), with exclusive
rights to invite/remove Collaborators, transfer ownership, and delete the
Budget. Every Budget has exactly one Owner at a time; ownership can be
transferred to an existing Collaborator, which converts the outgoing
Owner into a Collaborator on that Budget rather than dropping their
access (see [ADR 0004](docs/adr/0004-ownership-transfer-preserves-access-account-deletion-blocks-on-owned-budgets.md)).
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
in this table means "collaborator," full stop. Removal (Owner-initiated)
and leaving (Collaborator-initiated) both delete the row immediately, no
grace period, and both produce the same `collaborator removed` AuditEntry
action — the `actor` field is what distinguishes who did it.

**Invite**:
A pending, email-addressed request for someone to become a Collaborator
on a Budget, created by an Owner. A sign-in with that email — the
invitee's very first, if they had no account yet, or their next ordinary
one if they already did — converts the Invite into a BudgetMembership.
An Invite never expires on its own and is single-use: an Owner cancels it
outright to retract it, after which it can no longer be accepted, and
"resending" means canceling and creating a fresh Invite, not reviving the
same one.
_Avoid_: Invitation (either is fine informally, but "Invite" is the noun
used in code/schema).

**AuditEntry**:
A record that a User made a specific change to a Budget's data. Scoped to
a Budget; exists so an Owner or Collaborator can see who changed what.
Covers every Budget-scoped mutation — accounts, categories, category-month
budgeted amounts, payees, transactions, and membership changes (invite
sent/accepted/revoked, collaborator removed, ownership transferred) — not
just transactions. Captures a field-level diff of what changed (see
[ADR 0002](docs/adr/0002-audit-entry-is-a-single-polymorphic-table-with-field-diffs.md)
for the data model), referencing the mutated row polymorphically rather
than through a per-entity-type table. The actor is always a User (owner
or collaborator) — never a system/cron actor, since this only covers
changes made by people. Kept forever; no retention/pruning in scope.
Capturing the data is the whole deliverable for the initial effort — a UI
to view the log is a separate, later effort.
_Avoid_: Audit log (that's the collection; AuditEntry is one row in it).

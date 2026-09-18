# Ownership transfer preserves access; owner account deletion blocks on owned budgets

Transferring a Budget's ownership to an existing Collaborator converts the
outgoing Owner into a Collaborator on that Budget (a `BudgetMembership`
row created atomically with the `ownerId` swap), rather than dropping
their access — losing access to a budget you just handed off (e.g. a
shared household budget) would be a surprising side effect; if they
actually want off it, that's an ordinary "leave" afterward. Deleting a
User's account is blocked while they still own any Budget that has
Collaborators, rather than auto-picking a new owner or cascade-deleting
the Budget out from under other Collaborators; the owner must explicitly
transfer or delete each such Budget first. This keeps ADR 0001's
invariant ("exactly one Owner, always") structural: `Budget.ownerId`'s FK
to `User` can stay `RESTRICT`/`NO ACTION`, so the database itself refuses
to delete a User row that a Budget still points to. A Budget the deleted
User owned outright (no Collaborators) is soft-deleted automatically as
part of account deletion, reusing the existing `deleteBudget` convention —
nobody else is affected, so there's nothing to block on.

Removal (Owner-initiated) and leaving (Collaborator-initiated) both
delete the `BudgetMembership` row immediately, with no grace period,
matching [ADR 0003](0003-invite-resend-and-existing-account-invites-route-around-a-non-idempotent-invite-api.md)'s
precedent for canceling an Invite. Both produce the same
`collaborator removed` AuditEntry action; `actor` (the Owner vs. the
departing Collaborator) is what distinguishes the two, so no separate
"collaborator left" action was added.

## Considered options

- **Auto-forced-transfer** on owner account deletion (e.g. to the
  longest-tenured Collaborator) — rejected: needs an arbitrary heuristic
  nobody asked for, and silently reassigning ownership is its own
  surprise.
- **Cascade-delete the Budget** on owner account deletion when
  Collaborators exist — rejected: deletes other people's access to a
  Budget they're actively using, out from under them, as a side effect of
  someone else's account deletion.
- **Drop the outgoing Owner from the Budget** on ownership transfer —
  rejected: no one asked to lose access by giving up ownership; that's a
  separate "leave" action if they want it.
- **A distinct `collaborator left` AuditEntry action** — rejected: the
  `actor` field already encodes who initiated a removal, making a second
  action type redundant.

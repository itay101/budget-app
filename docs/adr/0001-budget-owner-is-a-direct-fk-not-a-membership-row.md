# Budget ownership is a direct FK, not a membership row

We're adding multi-user sharing: a Budget has one Owner and zero or more
Collaborators. We considered storing the Owner as just another row in the
BudgetMembership join table (distinguished by a `role` column), which
would give one uniform table for "everyone with access to this budget."
We instead store ownership directly as `Budget.ownerId`, with
BudgetMembership holding only Collaborators.

A single FK makes "who owns this" always exactly one unambiguous value —
transferring ownership is reassigning that FK, and it's structurally
impossible to end up with zero or two owners for a Budget. The
membership-row approach would need an app-level invariant ("exactly one
row per budget has role=OWNER") enforced outside the schema, and it was
rejected for that reason. It also means BudgetMembership needs no `role`
column at all, since Collaborator is the only access level in scope
today.

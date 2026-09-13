# User/Invite/BudgetMembership schema is locked; User rows deactivate, never delete

This locks the field-by-field Prisma schema for the three remaining new
models ([#65](https://github.com/itay101/budget-app/issues/65)), building
on the auth-vendor research's Postgres-trigger sketch and on
[ADR 0003](0003-invite-resend-and-existing-account-invites-route-around-a-non-idempotent-invite-api.md)/[ADR 0004](0004-ownership-transfer-preserves-access-account-deletion-blocks-on-owned-budgets.md)'s
mechanics decisions. The one decision here that revises prior thinking:
**`public.User` rows are never deleted, only deactivated.**

## `User`

```prisma
model User {
  id            String    @id @db.Uuid // == auth.users.id; no @default — only the trigger inserts rows
  email         String    // lower-cased on write
  deactivatedAt DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  ownedBudgets Budget[]           @relation("BudgetOwner")
  memberships  BudgetMembership[]
  invitesSent  Invite[]
  auditEntries AuditEntry[]
}
```

`id` is a `uuid`, not this codebase's usual `cuid()` text id, because it
must equal `auth.users.id` verbatim — Supabase's own guidance is to
reference nothing but that primary key, since every other `auth.users`
column can change out from under you.

A partial unique index enforces uniqueness only among active users,
the same technique already used for `Budget.currency` (Prisma's schema
DSL can't express a partial index, so both live in the migration SQL
with a pointer comment on the model):

```sql
CREATE UNIQUE INDEX "User_email_active_key" ON "User" (email) WHERE "deactivatedAt" IS NULL;
```

**Why deactivate instead of delete.** The natural reading of "delete your
account" is that your Supabase credentials/identity are actually gone —
so `auth.users` really is deleted via the Admin API. But `AuditEntry` is
kept forever ([ADR 0002](0002-audit-entry-is-a-single-polymorphic-table-with-field-diffs.md))
and always has a real actor; a hard-deleted `public.User` would force
`AuditEntry.actorId` to go nullable and carry a denormalized snapshot
(e.g. an email captured at write time) just to keep old entries legible.
Keeping the mirrored `public.User` row forever — stamped `deactivatedAt`
instead of removed — sidesteps that entirely: `AuditEntry.actorId` stays
a plain required FK, permanently resolvable, no snapshot field needed.
One consequence: a later invite to the same email address (after the old
account's `auth.users` row was deleted) creates a *new* `public.User` row
via the trigger, distinct from the old deactivated one — hence the
partial index above rather than a plain unique constraint.

Deactivating a `User` deletes their `BudgetMembership` rows explicitly, as
part of the same action (not by relying on the FK cascade below, since the
`User` row it would cascade from no longer disappears).

## Trigger: mirroring `auth.users` into `public.User`

```sql
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public."User" (id, email, "createdAt", "updatedAt")
  values (new.id, lower(new.email), now(), now());
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.handle_user_email_update()
returns trigger as $$
begin
  update public."User"
  set email = lower(new.email), "updatedAt" = now()
  where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute procedure public.handle_user_email_update();
```

## Trigger: DB-level backstop on the "exactly one Owner" invariant

[ADR 0001](0001-budget-owner-is-a-direct-fk-not-a-membership-row.md)'s "a
Budget always has exactly one Owner" was meant to be structural, enforced
by Postgres refusing to delete a `User` row a `Budget.ownerId` still
points to. Deactivation breaks that: nothing about setting
`deactivatedAt` trips a foreign key, so a bug in the app-level
pre-check (verify no owned Budget has Collaborators before deactivating,
per [ADR 0004](0004-ownership-transfer-preserves-access-account-deletion-blocks-on-owned-budgets.md))
could silently orphan the invariant. A trigger on `public."User"` restores
a DB-level backstop:

```sql
create function public.prevent_orphaning_owned_budgets()
returns trigger as $$
begin
  if old."deactivatedAt" is null and new."deactivatedAt" is not null then
    if exists (
      select 1
      from "Budget" b
      join "BudgetMembership" bm on bm."budgetId" = b.id
      where b."ownerId" = new.id
    ) then
      raise exception 'cannot deactivate User %: still owns a Budget with Collaborators', new.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger before_user_deactivated
  before update on public."User"
  for each row execute procedure public.prevent_orphaning_owned_budgets();
```

## `BudgetMembership`

```prisma
model BudgetMembership {
  id        String   @id @default(cuid())
  budgetId  String
  budget    Budget   @relation(fields: [budgetId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([budgetId, userId])
  @@index([userId])
}
```

No `role` column (per ADR 0001 — Collaborator is the only access level).
No status/state — a row's existence is the membership; removal
([ADR 0004](0004-ownership-transfer-preserves-access-account-deletion-blocks-on-owned-budgets.md))
deletes it outright. `onDelete: Cascade` on `userId` is a safety net that
in practice never fires (`User` rows are never hard-deleted, see above);
it's kept so the schema stays correct even if that ever changes.

## `Invite`

```prisma
model Invite {
  id                  String   @id @default(cuid())
  email               String   // lower-cased on write
  budgetId            String
  budget              Budget   @relation(fields: [budgetId], references: [id], onDelete: Cascade)
  invitedBy           String
  inviter             User     @relation(fields: [invitedBy], references: [id])
  // true: created via admin.inviteUserByEmail, so a new unconfirmed
  //   auth.users row exists solely for this Invite — canceling must also
  //   admin.deleteUser it (ADR 0003).
  // false: the email already had a confirmed account when invited — no
  //   Supabase-side row was created for this Invite, so canceling must
  //   never touch Supabase auth at all.
  createdSupabaseUser Boolean
  createdAt           DateTime @default(now())

  @@unique([budgetId, email])
  @@index([email])
}
```

No `status` column: per [ADR 0003](0003-invite-resend-and-existing-account-invites-route-around-a-non-idempotent-invite-api.md),
resend is cancel-and-recreate and cancellation hard-deletes the row.
Acceptance (converting to a `BudgetMembership`) does the same — deletes
the `Invite` row rather than marking it `ACCEPTED`. A row's mere existence
*is* "pending"; `AuditEntry` (`invite sent`/`accepted`/`revoked`) is the
permanent record of what happened to it, so a parallel status column on
`Invite` itself would just duplicate that. `@@index([email])` supports the
accept-time lookup ("does the signed-in user's email have a pending
Invite anywhere?"), separate from the per-budget uniqueness check.

Canceling a Budget that's auto soft-deleted (owner account deactivated,
no Collaborators — [ADR 0004](0004-ownership-transfer-preserves-access-account-deletion-blocks-on-owned-budgets.md))
also cancels that Budget's pending Invites the same way an ordinary
cancellation would, rather than leaving them dangling against a
functionally-dead Budget.

## `Budget.ownerId` (addendum to ADR 0001)

```prisma
model Budget {
  // ...existing fields...
  ownerId String
  owner   User   @relation("BudgetOwner", fields: [ownerId], references: [id], onDelete: Restrict)
}
```

`onDelete: Restrict` is kept for defensiveness even though `User` rows
are never actually deleted (see above) — belt-and-suspenders alongside
the deactivation-time trigger backstop.

## Addendum to ADR 0002: `AuditEntry.actor`

`AuditEntry.actorId` is a required, non-nullable FK to `User` with no
special `onDelete` behavior — safe only because `User` rows are never
hard-deleted (this ADR). If that ever changes, this FK needs revisiting
alongside it.

## Considered options

- **Hard-delete `User` on account deletion** — rejected: forces
  `AuditEntry.actorId` nullable plus a denormalized actor snapshot to
  keep old entries legible, just to let the row disappear.
- **Infer Invite's Supabase-cleanup case at cancel-time** (query Supabase
  for the email's current confirmation state instead of storing
  `createdSupabaseUser`) — rejected: saves one column at the cost of an
  extra API call on every cancellation and an inference the schema itself
  doesn't record.
- **App-level check only for the owner/Collaborator deactivation
  invariant, no DB trigger** — rejected: leaves ADR 0001's "exactly one
  Owner, always" resting entirely on every code path remembering to
  check, rather than structural.

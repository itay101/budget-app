# Invite resend and existing-account invites route around Supabase's non-idempotent invite API

We invite collaborators via `supabase.auth.admin.inviteUserByEmail`, but
that call hard-errors ("user already registered") for any email that
already has an `auth.users` row — whether still-pending/unconfirmed or
fully confirmed. That single vendor constraint shapes two decisions:
there is no separate "resend" operation — an Owner resends by canceling
the pending Invite (which deletes both the local `Invite` row and the
underlying unconfirmed Supabase user via `admin.deleteUser`, since
removing only the local row leaves the old invite link working) and
creating a fresh Invite; and inviting an email that already belongs to a
confirmed account never calls Supabase's invite API at all — it only
creates a pending `Invite` row, which the app checks for and offers to
accept on that user's next ordinary sign-in, rather than sending any
notification email.

An Invite has no app-level expiry: the underlying Supabase magic link
already expires on its own per Supabase's shared 24h OTP setting, so a
duplicate app-level TTL would just be redundant bookkeeping for no added
benefit.

## Considered options

- **Instant-add a known existing user directly as a BudgetMembership**,
  skipping the Invite step — rejected: being added to someone else's
  Budget without any acceptance step needs consent, not just a
  recognizable email.
- **Add a transactional email provider** (e.g. Resend) to notify an
  already-registered invitee by plain email — rejected: introduces a new
  vendor this effort otherwise has no need for, just to cover one edge
  case the next-sign-in check already handles.

# Auth vendor comparison: Supabase Auth vs Auth.js vs Clerk

Research for [#57](https://github.com/itay101/budget-app/issues/57), a child of the
[auth + budget sharing map](https://github.com/itay101/budget-app/issues/56).

## Recommendation

**Adopt Supabase Auth.** The Postgres database is already a Supabase project
(`src/app/api/cron/keepalive/route.ts` exists specifically to stop that project
from pausing), so Supabase Auth is the only option of the three that adds
*zero* new vendors and puts the user table in the same Postgres instance
Prisma already talks to. Its `admin.inviteUserByEmail` is the closest native
match to this app's locked invite-only flow, its session/middleware story is
documented and edge-compatible on Vercel, and its free tier (50,000 MAU) is
effectively unlimited at this app's personal/small-group scale.

The runner-up is Auth.js v5 — also free and vendor-free, but it requires
hand-building the invite-gate and the invite email that Supabase gives for
free. Clerk has the most polished invite-only primitive out of the box, but
it moves the user table fully outside Postgres, which fights the app's
existing "Prisma owns the schema" architecture more than it helps.

## Constraints recap (from the ticket)

- Invite-only signup, no public signup page; a pending `Invite` converts to a
  `BudgetMembership` on the invitee's first sign-in with that email.
- Session strategy in the Next.js App Router on Vercel, including
  edge-runtime compatibility for middleware.
- How the vendor's user storage interacts with the existing Prisma/Postgres
  schema.
- Cost and lock-in at personal/small-group scale.
- Which sign-in method (password / magic link / OAuth) fits invite-only best.

## Comparison matrix

| | **Supabase Auth** | **Auth.js v5 (NextAuth)** | **Clerk** |
|---|---|---|---|
| New vendor? | No — same Supabase project as the DB | No — self-hosted library | Yes — separate identity platform |
| Native invite primitive | `auth.admin.inviteUserByEmail()` creates the user and emails a magic link in one call ([docs](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)) | None — build on the `signIn` callback + your own `Invite` table ([discussion](https://github.com/nextauthjs/next-auth/discussions/4106)) | `createInvitation()` + built-in **Restricted** sign-up mode that disables public sign-up entirely ([docs](https://clerk.com/docs/guides/users/inviting), [docs](https://clerk.com/docs/guides/secure/restricting-access)) |
| Session storage | HTTP-only cookies via `@supabase/ssr`, refreshed in middleware | Signed JWT cookie (edge-safe) *or* DB session (not edge-safe) | Signed JWT cookie |
| Edge-middleware compatible | Yes — middleware only calls the Supabase Auth HTTP API, no Prisma ([docs](https://supabase.com/docs/guides/auth/server-side/nextjs)) | Yes, but only if you split config so the Prisma adapter is excluded from the edge config and force `strategy: "jwt"` ([docs](https://authjs.dev/guides/edge-compatibility)) | Yes, native, at the cost of an outbound JWKS fetch on cold start (~15–25 ms, then cached) |
| Where the user table lives | `auth.users`, in the same Postgres DB as Prisma's `public` schema | Prisma-owned tables (`User`, `Account`, `Session`, `VerificationToken`) via the official adapter ([docs](https://authjs.dev/getting-started/adapters/prisma)) | Fully external (Clerk's own store); synced into Postgres via webhooks, not transactionally |
| Best-fit sign-in method | Magic link (invite email *is* the first sign-in link); password/OAuth optional | Magic link via an email provider (e.g. Resend) — same mechanism, but you gate who can request one | Magic link/OTP or OAuth via the Account Portal; email auto-verified from the invitation |
| Cost at small scale | Free — 50,000 MAU on the free tier, already-paid-for project ([source](https://uibakery.io/blog/supabase-pricing)) | Free — OSS, no usage limits, only the email-sending cost (e.g. Resend's free tier) | Free up to 50,000 **retained** users (MRU, stricter than MAU) ([source](https://clerk.com/blog/new-pricing-plans)) |
| Lock-in | Low-medium — Postgres-based, but `auth.users` schema/API is Supabase-specific | Lowest — plain OSS tables you own outright | Highest — user identities live outside your database entirely |

## Detail: Supabase Auth

**Invite-only fit.** `supabase.auth.admin.inviteUserByEmail(email, { redirectTo })`
creates the `auth.users` row and sends an email containing a magic link in
one server-side call. Clicking it authenticates the user and redirects into
the app, where the recommended pattern is to force a `/set-password` (or
equivalent) step before granting access to anything else, since the linked
session is live before a password is set
([supabase/supabase#45210](https://github.com/supabase/supabase/issues/45210)).
This is exactly the "invite email doubles as the first sign-in" shape the
ticket asks about. There's no need for a separate email-sending integration
for this leg — Supabase sends it.

**Session/middleware.** The documented Next.js App Router pattern
(`@supabase/ssr`) stores the session in HTTP-only cookies and refreshes it in
middleware by calling `supabase.auth.getUser()` (never `getSession()`, which
Supabase's own docs warn is not guaranteed to revalidate the token server-side)
([docs](https://supabase.com/docs/guides/auth/server-side/nextjs)). That call
is an HTTPS request to the Supabase Auth API, not a Prisma/Postgres query, so
it runs fine in Vercel's Edge Runtime — consistent with the general finding
that Prisma Client itself cannot run on the Edge Runtime at all
([prisma/prisma#20560](https://github.com/prisma/prisma/issues/20560)), which
argues for keeping *all* three vendors' edge/middleware layer limited to
token/cookie checks and pushing any Prisma-backed permission check into
Server Actions/Route Handlers (Node runtime), regardless of which vendor is
picked.

**Prisma interaction.** Supabase Auth owns `auth.users` in the same Postgres
database. The documented pattern is a Postgres trigger
(`on_auth_user_created`) that mirrors new `auth.users` rows into an
app-owned `public` table, referencing `auth.users.id` as the primary key
only (Supabase explicitly warns against referencing anything but the primary
key, since other columns can change)
([docs](https://supabase.com/docs/guides/auth/managing-user-data)). Prisma
doesn't manage `auth.users` itself, but it can own a `public."User"` table
whose `id` is kept equal to `auth.users.id` by that trigger, and Prisma
`BudgetMembership`/`Invite`/`AuditEntry` models then have ordinary FKs into
that `public."User"` table — no change to how Prisma is used elsewhere in
the app.

**Cost/lock-in.** Auth is bundled into the already-paid-for Supabase project:
free tier covers 50,000 MAU, Pro (if ever needed) 100,000
([source](https://uibakery.io/blog/supabase-pricing)) — far beyond a
personal/small-group budgeting app. Lock-in is moderate: migrating off
Supabase Auth later means re-pointing at a new identity provider and backfilling
a password/OAuth link for each existing user, but the data itself
(`auth.users` in a plain Postgres table you already run) isn't hidden behind
a proprietary API the way Clerk's is.

## Detail: Auth.js v5 (NextAuth)

**Invite-only fit.** No built-in invite/pending-user object. The standard
pattern is the `signIn` callback: check the incoming email against your own
allow-list/`Invite` table and return `false` (or redirect) if it isn't
present ([NextAuth discussion #4106](https://github.com/nextauthjs/next-auth/discussions/4106),
[callbacks docs](https://next-auth.js.org/configuration/callbacks)). This is
straightforward to build correctly, but it is work Supabase gives for free —
you'd also need to wire up an email provider (e.g. Resend) yourself to send
the actual invite/magic-link email, whereas Supabase's `inviteUserByEmail`
sends it as part of the same call.

**Session/middleware.** Auth.js v5 explicitly documents that edge middleware
only supports the `jwt` session strategy, and recommends splitting
configuration into an edge-safe `auth.config.ts` (no adapter) and a full
`auth.ts` (with the Prisma adapter) used everywhere except middleware,
because an ORM-backed adapter cannot run on the edge
([edge-compatibility docs](https://authjs.dev/guides/edge-compatibility)).
Once split this way, it's a clean, documented, edge-compatible setup — the
same shape Supabase and Clerk both converge on (JWT/cookie check at the
edge, DB-aware logic in Node-runtime Server Actions/Route Handlers).

**Prisma interaction.** This is Auth.js's strongest point: the official
Prisma adapter creates and fully owns `User`, `Account`, `Session`, and
`VerificationToken` models directly in your Prisma schema
([docs](https://authjs.dev/getting-started/adapters/prisma)) — no separate
`auth` schema, no mirror trigger, no second source of truth. A
`BudgetMembership`/`Invite`/`AuditEntry` model can FK straight into that
`User` model with an ordinary Prisma relation.

**Cost/lock-in.** No vendor cost at all — the only recurring cost is
whichever transactional-email provider you pick for magic links (Resend's
free tier is generous). Lock-in is the lowest of the three: it's your own
Postgres tables and an OSS library with no proprietary API to migrate away
from later.

## Detail: Clerk

**Invite-only fit.** The best out-of-the-box match: Clerk's application-level
**Restricted** sign-up mode disables public sign-up entirely, and
`createInvitation()` sends a unique link that auto-verifies the invited
email and lands the user in your sign-up flow — allow-listing isn't even
needed on top, since restricted/invite-only mode already blocks uninvited
emails ([docs](https://clerk.com/docs/guides/users/inviting),
[docs](https://clerk.com/docs/guides/secure/restricting-access)). Invitations
expire after 30 days by default and can be revoked via `revokeInvitation()`.
Note this only gates *global* account creation — it still says nothing about
which `Budget` the invitee should land as a `Collaborator` on; that
`Budget`-specific `Invite`→`BudgetMembership` linkage is app-level work in
all three options, not something any vendor's invitation object models for
you.

**Session/middleware.** `clerkMiddleware()` is Edge Runtime-compatible via a
signed JWT and JWKS verification; the main cost is a JWKS fetch on cold
start (roughly 15–25 ms, then cached), not a fundamental incompatibility
([docs](https://clerk.com/docs/reference/nextjs/clerk-middleware)).

**Prisma interaction.** This is Clerk's weak point for this app: it owns the
entire user identity externally, with no row in your Postgres database at
all by default. The documented integration path is a webhook
(`user.created`, etc., signed via Svix) that your app receives and uses to
`upsert` a mirrored `User` row (keyed by a `clerkId` field) into Prisma
([docs](https://clerk.com/docs/webhooks/sync-data)). That sync is
asynchronous and eventually-consistent relative to the request that created
the Clerk user — a real mismatch against the ticket's "first sign-in
converts the pending `Invite` into a `BudgetMembership`" requirement, which
wants that conversion to happen deterministically in the same flow as the
sign-in, not in a webhook racing it.

**Cost/lock-in.** Free up to 50,000 **monthly retained users** — a stricter
unit than MAU (a user only counts as "retained" once they return 24+ hours
after signing up), then $25/mo (or $20/mo billed annually) on Pro
([source](https://clerk.com/blog/new-pricing-plans)). Immaterial at this
app's scale either way. Lock-in is the highest of the three: every user's
credentials and identity live in Clerk's platform, not in a database this
app controls, so migrating away means a real user-migration project, not a
schema change.

## Other options considered

- **Lucia** — was a natural "own your Postgres tables" alternative to
  Auth.js, but its author deprecated it in favor of copy-in reference code
  rather than an installed dependency, and it doesn't offer anything Auth.js
  doesn't already cover here. Not recommended.
- **Fully hand-rolled (bcrypt + own session cookies)** — rejected outright:
  it reproduces Auth.js's downsides (no invite primitive, all custom code)
  while also taking on password-hashing and session-security work that a
  maintained library already does correctly.

## Fog this resolves (from issue #56)

- **Session/middleware architecture**: cookie-based sessions via
  `@supabase/ssr`; middleware calls `supabase.auth.getUser()` on every
  request to validate/refresh the session (HTTPS call to the Supabase Auth
  API, not Prisma), which runs on the Vercel Edge Runtime without issue.
- **Where permission checks live**: per-action/helper checks backed by
  Prisma (e.g. a `requireBudgetAccess(userId, budgetId)` helper alongside
  the existing query helpers in `src/lib/budget.ts`), not Postgres RLS.
  Since Prisma — not PostgREST/the Supabase client — is this app's only
  database access path, RLS would be a second, redundant enforcement layer
  the app can't easily test or reason about alongside its existing
  Prisma-based code.

## Fog this narrows but doesn't fully close

- **`User`/`Invite`/`BudgetMembership`/`AuditEntry` Prisma schema**: the
  vendor choice fixes the shape of `User` (`id` mirrors `auth.users.id` via
  a Postgres trigger, per Supabase's documented pattern) and confirms
  `Invite`/`BudgetMembership`/`AuditEntry` are ordinary Prisma models FKing
  into it — but the exact fields, indexes, and cascade rules for those
  models still need a dedicated schema-design pass.
- **Invite delivery mechanics**: the mechanism is now fixed
  (`supabase.auth.admin.inviteUserByEmail`, which sends its own email — no
  separate ESP needed for this leg), but resend/expiry-window
  configuration, revocation of a still-pending invite, and the behavior
  when the invited email already has a Supabase Auth account (e.g. invited
  to a second `Budget`) are still open and need a follow-up design pass.

Membership lifecycle (removal, leaving, ownership transfer, owner deletion)
and audit-log surfacing are unrelated to the auth-vendor choice and remain
open, as scoped.

## Sources

- [Supabase: `inviteUserByEmail` (JS reference)](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
- [Supabase: Setting up Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase: Managing user data](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase pricing breakdown (2026)](https://uibakery.io/blog/supabase-pricing)
- [supabase/supabase#45210 — invite/recovery links create a session before password is set](https://github.com/supabase/supabase/issues/45210)
- [Auth.js: Edge compatibility guide](https://authjs.dev/guides/edge-compatibility)
- [Auth.js: Prisma adapter](https://authjs.dev/getting-started/adapters/prisma)
- [nextauthjs/next-auth discussion #4106 — built-in invite-only auth](https://github.com/nextauthjs/next-auth/discussions/4106)
- [NextAuth callbacks docs (`signIn`)](https://next-auth.js.org/configuration/callbacks)
- [Clerk: Invite users to your application](https://clerk.com/docs/guides/users/inviting)
- [Clerk: Restricting access](https://clerk.com/docs/guides/secure/restricting-access)
- [Clerk: `clerkMiddleware()` reference](https://clerk.com/docs/reference/nextjs/clerk-middleware)
- [Clerk: Sync data to your app with webhooks](https://clerk.com/docs/webhooks/sync-data)
- [Clerk 2026 pricing update (50K MRU free tier)](https://clerk.com/blog/new-pricing-plans)
- [prisma/prisma#20560 — Prisma Client cannot run under the Vercel Edge Runtime](https://github.com/prisma/prisma/issues/20560)

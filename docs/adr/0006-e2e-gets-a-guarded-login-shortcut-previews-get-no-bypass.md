# e2e gets a guarded login shortcut; preview deployments get no bypass

Two auth-testing questions came up implementing #56's spec (tracked as
#69) that the original spec didn't cover: how do e2e tests authenticate,
and do preview deployments get any shortcut around real auth?

**e2e.** `e2e/*.spec.ts` runs against `docker-compose.yml`'s `db-e2e` — a
disposable plain Postgres container with no Supabase project behind it,
so there's no real `auth.users`/GoTrue to sign in against the way
production does. Standing up the Supabase CLI's local stack (Postgres +
GoTrue + Kong) in CI/local just for e2e was considered and rejected: real
added complexity and runtime cost, for a personal single-owner app where
authorization *logic* (not the login UI) is what actually needs
end-to-end coverage. Instead, e2e gets one test-only login shortcut: a
route/middleware hook that mints a session for a seeded user, gated by an
env var set only inside Playwright's own `webServer.env` (see
`playwright.config.ts`) — never a Vercel project setting — plus a hard
`!process.env.VERCEL` check as defense-in-depth, since Vercel sets
`VERCEL=1` on every deployment it runs, previews included. That check
means the shortcut can't take effect even if the env var were ever set
somewhere it shouldn't be. It skips only the login UI: every
ownership/membership check in application code still runs for real
against the seeded user, so authorization bugs are still caught.

**Preview deployments get no bypass.** A preview is a real Next.js build
against a real (shared, non-prod) Supabase project — unlike e2e, there's
no infra reason it can't use real auth. A `VERCEL_ENV === "preview"`
bypass was considered and rejected: it would leave every open PR's
preview URL unauthenticated end-to-end for as long as it's up, which is
a standing security regression, not a neutral convenience. Reviewing a
preview instead means signing in with one seeded reviewer account,
created once in the shared preview/dev Supabase project and reused
across every preview — the same invite-only signup rule production uses,
no exception carved out for previews.

## Addendum: the `auth.users` mirror trigger is conditional

ADR 0005's mirror trigger attaches to `auth.users` — a table that only
exists on a real Supabase project. This repo's local dev (`docker-compose.yml`'s
`db`) and e2e (`db-e2e`) databases are plain Postgres with no Supabase
project behind them, so the migration wraps the two `CREATE TRIGGER ...
ON auth.users` statements in a `to_regclass('auth.users') IS NOT NULL`
guard and skips them wherever that table is absent, rather than failing
the migration outright in every non-Supabase-backed environment. The
trigger *functions* are defined unconditionally either way (they don't
reference `auth.users` in their own bodies, only generic per-row trigger
fields) — only attaching them to a table that may not exist is
conditional. Environments where the trigger is skipped have no working
substitute for it here; #72's e2e login shortcut inserts a `public.User`
row directly instead of relying on it firing.

## Addendum: `Budget.ownerId` ships nullable, not required

ADR 0005 locks `Budget.ownerId` as `String` (required). This repo has
existing, non-empty `Budget` rows that predate any `User` to own them,
and the mirror trigger that populates `public.User` can't backfill a
`User` that doesn't exist yet at the moment this migration first runs in
any environment (dev, preview, or production) — there's no ordering that
lets one migration both introduce the `User`/trigger infrastructure *and*
enforce `NOT NULL` against data it can't yet know the value of.

`ownerId` therefore ships nullable in the foundation migration
(#70/20260913120000_add_auth_and_sharing). `scripts/bootstrap-first-owner.ts`
creates the first real Supabase user (a manual, one-time operation per
environment — see the script's own comments) and backfills every
pre-existing `Budget` to that user. Once every code path that creates a
`Budget` unconditionally supplies an owner (starting with `createBudget`,
in #71) and the backfill has run in every environment, a follow-up
migration in #71 adds the `NOT NULL` constraint, matching ADR 0005
exactly from then on. Every *other* new table (`User`, `BudgetMembership`,
`Invite`, `AuditEntry`) matches ADR 0005 verbatim from the start — they're
brand new and empty, so they have no equivalent bootstrapping problem.

## Considered options

- **Supabase CLI local stack for e2e** — rejected: real infra/CI
  complexity to also exercise the login UI itself, which isn't what e2e
  needs to cover here.
- **Preview-only auth bypass** (`VERCEL_ENV === "preview"`) — rejected:
  turns every open PR into a standing unauthenticated surface for as long
  as it's open.
- **`Budget.ownerId` required from the first migration, with a synthetic
  placeholder User** — rejected: a fabricated `User` row with no real
  Supabase credentials behind it can never actually sign in, defeating
  the point of an "owner."

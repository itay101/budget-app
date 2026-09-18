# budget-app

A personal, YNAB-style budgeting app: accounts, category groups/categories,
monthly budgeted amounts, payees, and transactions — built to be extended
with your own features over time.

## Stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript + Tailwind CSS
- [Prisma](https://www.prisma.io/) + PostgreSQL
- Server actions for mutations (no separate API layer needed to start)

Money is stored as integer **milliunits** (`amount * 1000`) everywhere, the
same convention YNAB's own API uses — `$12.34` is `12340`. See
[`src/lib/money.ts`](./src/lib/money.ts).

## Design system

UI colors, typography, and spacing follow [`design.md`](./design.md) (the
Atlassian Design System), applied as Tailwind tokens in
[`tailwind.config.ts`](./tailwind.config.ts) — `brand`/`neutral`/`success`/
`warning`/`danger`/`discovery`/`info` colors, and `display`/`h1`/`h2`/`h3`/
`body`/`small` text sizes.

## Data model

See [`prisma/schema.prisma`](./prisma/schema.prisma):

- `Budget` — the top-level container, owned by one `User` and optionally
  shared with collaborators; also the unit a currency lives in, since
  every account/category/transaction hangs off one budget. Multiple
  budgets are supported (switch between them from the sidebar), one per
  currency — see [`src/lib/currencies.ts`](./src/lib/currencies.ts) and
  [`src/app/budgets/actions.ts`](./src/app/budgets/actions.ts)
- `Account` — checking/savings/credit card/etc., on- or off-budget
- `CategoryGroup` / `Category` — how spending is organized
- `CategoryMonth` — how much was budgeted to a category in a given month
- `Payee` — who a transaction was to/from
- `Transaction` — the actual money movements
- `User` / `Invite` / `BudgetMembership` — authentication and budget
  sharing (owner + collaborators, invite-only signup); see
  [CONTEXT.md](./CONTEXT.md) and [`docs/adr/`](./docs/adr) for the full
  design
- `AuditEntry` — a record of who changed what on a Budget

## Authentication

Sign-in is [Supabase Auth](https://supabase.com/docs/guides/auth) —
magic-link email (no password), or Google — see
[docs/adr/0005](./docs/adr/0005-user-invite-budgetmembership-schema-is-locked-users-deactivate-not-delete.md)
and [docs/adr/0006](./docs/adr/0006-e2e-gets-a-guarded-login-shortcut-previews-get-no-bypass.md).
There is no signup page: an account only exists after being invited to a
Budget by its owner, or via the one-time bootstrap below. This holds for
Google sign-in too — a Google account with no matching invite/existing
account is rejected at `/auth/callback` (see that route's doc comment).

- Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`) to a real Supabase
  project — sign-in doesn't work against the plain local Postgres
  container `docker compose up -d` starts, since it has no `auth` schema.
- **First-ever user in an environment:** nothing can invite them, so run
  `npm run bootstrap:first-owner -- you@example.com` once (needs
  `SUPABASE_SERVICE_ROLE_KEY` set) — it invites that email and makes them
  owner of every pre-existing Budget. See the script's own comments.
- **To enable Google sign-in** on a given Supabase project: in the
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
  create an OAuth 2.0 Client ID (Web application) with authorized redirect
  URI `https://<your-project-ref>.supabase.co/auth/v1/callback` (find the
  exact value under Supabase's own Authentication -> Providers -> Google
  panel), then paste that client's ID/secret into that same Supabase
  panel and enable the provider. Nothing needs to change in this app's own
  env vars — see `.env.example`.

## Getting started

1. **Start Postgres locally:**

   ```bash
   docker compose up -d
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment:**

   ```bash
   cp .env.example .env
   ```

4. **Run migrations and seed starter data:**

   ```bash
   npm run prisma:migrate
   npm run db:seed
   ```

5. **Run the dev server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command                  | Description                              |
| ------------------------ | ----------------------------------------- |
| `npm run dev`             | Start the dev server                      |
| `npm run build`           | Production build                          |
| `npm run start`           | Run the production build                  |
| `npm run lint`            | Lint                                      |
| `npm run typecheck`       | Type-check without emitting               |
| `npm test`                 | Run unit tests (`src/lib/*.test.ts`)      |
| `npm run test:coverage`    | Unit tests with a coverage report          |
| `npm run test:e2e`         | Run the Playwright e2e suite               |
| `npm run test:e2e:ui`      | Playwright's UI mode, for writing/debugging e2e tests |
| `npm run prisma:migrate`  | Create/apply a dev migration               |
| `npm run prisma:studio`   | Open Prisma Studio (DB browser/editor)     |
| `npm run db:seed`         | Seed starter accounts/categories/data      |

## Testing

- **Unit tests** (`src/lib/*.test.ts`, Jest) cover the app's pure-logic
  layer — CSV/import parsing, account types, and similar. `npm test` runs
  them; `npm run test:coverage` adds a coverage report (`coverage/`,
  gitignored) scoped to `src/lib` — see [`jest.config.js`](./jest.config.js).
- **e2e tests** (`e2e/*.spec.ts`, [Playwright](https://playwright.dev/))
  drive the app end-to-end through a real browser against a real
  Postgres database, covering the main flows: the budget/accounts pages
  rendering, creating a category group/category and budgeting it, and
  adding a transaction.

  They run against a disposable database — `docker-compose.yml`'s
  `db-e2e` service, kept separate from the `db` service your normal dev
  data lives in — which `npm run test:e2e` resets, migrates, and reseeds
  from scratch on every run (see `db:e2e:reset` in
  [`package.json`](./package.json) and the comments in
  [`playwright.config.ts`](./playwright.config.ts)), so tests are free to
  create/edit data without any cleanup of their own and without ever
  touching real data:

  ```bash
  docker compose up -d db-e2e
  npm run test:e2e
  ```

  CI (see [`.github/workflows/tests.yml`](./.github/workflows/tests.yml))
  runs both suites on every push/PR as their own check, deliberately
  decoupled from Vercel's preview deployment — a red test is visible on
  the PR but never blocks or delays the preview build.

  Every e2e run — passing or not — captures a
  [trace](https://playwright.dev/docs/trace-viewer) per test and uploads
  the HTML report as a `playwright-report` build artifact on the workflow
  run, so any PR's actual behavior (including a one-off flake) can be
  inspected with the trace viewer without reproducing it locally first.
  Once a PR merges, [`cleanup-pr-artifacts.yml`](./.github/workflows/cleanup-pr-artifacts.yml)
  deletes its `coverage`/`playwright-report` artifacts right away instead
  of leaving them to expire.

## Keeping the Supabase project awake

Supabase's free tier pauses a project after 7 days with no activity. In
production, [`vercel.json`](./vercel.json) schedules a daily
[Vercel Cron](https://vercel.com/docs/cron-jobs) hit against
`/api/cron/keepalive` ([`src/app/api/cron/keepalive/route.ts`](./src/app/api/cron/keepalive/route.ts)),
which runs a trivial query against the database. That keeps the project
active indefinitely without needing to upgrade off the free plan. Cron
jobs only run for production deployments, so this only covers whichever
Supabase project is wired to `DATABASE_URL` in the production environment
on Vercel — point that at the project you want to keep alive.

Optionally set a `CRON_SECRET` env var on Vercel so the endpoint only
accepts Vercel's own cron requests (see [`.env.example`](./.env.example)).

## Roadmap ideas

This is intentionally a minimal scaffold to build on. Some natural next
features:

- Credit card payment auto-categorization
- Split transactions
- Reports (spending by category, net worth over time)
- Import from YNAB's own export format

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

- `Budget` — the top-level container (single-user for now); also the unit
  a currency lives in, since every account/category/transaction hangs off
  one budget. Multiple budgets are supported (switch between them from the
  sidebar), one per currency — see [`src/lib/currencies.ts`](./src/lib/currencies.ts)
  and [`src/app/budgets/actions.ts`](./src/app/budgets/actions.ts)
- `Account` — checking/savings/credit card/etc., on- or off-budget
- `CategoryGroup` / `Category` — how spending is organized
- `CategoryMonth` — how much was budgeted to a category in a given month
- `Payee` — who a transaction was to/from
- `Transaction` — the actual money movements

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

That leaves a separate dev/preview Supabase project (e.g. `budget-app-dev`)
uncovered, since it isn't wired to production's `DATABASE_URL` and Vercel
Cron never invokes preview deployments — so it keeps crossing the 7-day
window and Supabase keeps emailing about pausing it. A second cron,
`/api/cron/keepalive-dev`
([`src/app/api/cron/keepalive-dev/route.ts`](./src/app/api/cron/keepalive-dev/route.ts)),
pings that project directly using its own connection string. Set
`DEV_DATABASE_URL` on Vercel's **production** environment to the dev
project's connection string to enable it (see
[`.env.example`](./.env.example)); until it's set, the route is a no-op.

Optionally set a `CRON_SECRET` env var on Vercel so the endpoints only
accept Vercel's own cron requests (see [`.env.example`](./.env.example)).

## Roadmap ideas

This is intentionally a minimal scaffold to build on. Some natural next
features:

- Credit card payment auto-categorization
- Split transactions
- Auth (multiple users, not just multiple budgets)
- Reports (spending by category, net worth over time)
- Import from YNAB's own export format

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

- `Budget` — the top-level container (single-user for now)
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
| `npm run prisma:migrate`  | Create/apply a dev migration               |
| `npm run prisma:studio`   | Open Prisma Studio (DB browser/editor)     |
| `npm run db:seed`         | Seed starter accounts/categories/data      |

## Roadmap ideas

This is intentionally a minimal scaffold to build on. Some natural next
features:

- Credit card payment auto-categorization
- Split transactions
- Multiple budgets / auth
- Reports (spending by category, net worth over time)
- Import from YNAB's own export format

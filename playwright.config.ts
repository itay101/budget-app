import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

// The disposable database the app server (started below) points at -
// never the developer's own dev database (`docker-compose.yml`'s `db`
// service), so tests that create data can't leave junk behind in or
// corrupt anything real. See docker-compose.yml's `db-e2e` service for
// the default's matching container.
export const E2E_DATABASE_URL =
  process.env.PLAYWRIGHT_DATABASE_URL ??
  "postgresql://budget:budget@localhost:5433/budget_e2e?schema=public";

export default defineConfig({
  testDir: "./e2e",
  // Tests share one seeded database rather than each getting its own, so
  // they run serially instead of racing each other's writes.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : "list",
  // Signs every test in as prisma/seed.ts's seeded owner via the e2e-only
  // login shortcut (#72, docs/adr/0006) before any test runs, once, and
  // shares the resulting session across all of them.
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    storageState: "e2e/.auth/user.json",
    // CI captures a trace for every test (not just failing/retried ones)
    // so the HTML report published as a PR artifact (see
    // .github/workflows/tests.yml) always has a trace to open for
    // debugging - locally, only on a retry keeps things fast.
    trace: process.env.CI ? "on" : "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `db:e2e:reset` (drop/recreate schema, migrate, seed - see its
    // script definition) has to finish *before* the app starts serving,
    // not just before tests run: Playwright's health check polls the URL
    // for a 2xx/3xx response, and every route here queries the database
    // on render, so a server that comes up against a not-yet-migrated
    // database would 500 on every check and never be considered ready.
    // CI then builds for production (closer to what actually ships);
    // locally, `next dev` avoids requiring a fresh build before every run.
    command: process.env.CI
      ? `npm run db:e2e:reset && npm run build && npm run start -- -p ${PORT}`
      : `npm run db:e2e:reset && npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      // Non-functional placeholders: @supabase/ssr's client constructor
      // throws immediately if these are empty/undefined (see
      // src/lib/supabase/{client,server,middleware}.ts), so the server
      // can't even boot without *some* value — but e2e's Postgres has no
      // real Supabase project behind it (see docs/adr/0006). The e2e
      // login shortcut below skips ever needing a working Supabase
      // connection at all; these just satisfy the constructor for the
      // small number of code paths (middleware's fallback, /sign-in
      // itself) that still construct a client.
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
      // The e2e-only login shortcut (#72, docs/adr/0006) — set ONLY
      // here, never a Vercel project setting. See
      // src/lib/e2eTestAuth.ts's isE2ETestAuthEnabled for the second,
      // independent guard (no VERCEL env var) that keeps this from ever
      // taking effect outside a locally-run e2e process even if this
      // value leaked somewhere it shouldn't.
      E2E_TEST_AUTH_ENABLED: "1",
    },
  },
});

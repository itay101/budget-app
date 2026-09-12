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
  use: {
    baseURL: BASE_URL,
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
    env: { DATABASE_URL: E2E_DATABASE_URL },
  },
});

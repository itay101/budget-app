/**
 * The e2e-only login shortcut (#72, see docs/adr/0006). `e2e/*.spec.ts`
 * runs against a plain Postgres database (docker-compose.yml's `db-e2e`)
 * with no real Supabase project — no `auth.users`, no GoTrue — so there's
 * no way for e2e to sign in through the real flow at all. This lets a
 * test become a seeded user directly, skipping only the login UI: every
 * ownership/membership check downstream still runs for real against
 * whichever user this names.
 *
 * Gated by TWO independent conditions, both required:
 *  - `E2E_TEST_AUTH_ENABLED` must be exactly `"1"` — set only in
 *    playwright.config.ts's `webServer.env`, never a Vercel project
 *    setting.
 *  - `process.env.VERCEL` must be unset — Vercel sets `VERCEL=1` on
 *    every deployment it runs, previews included, so this alone blocks
 *    the shortcut from ever taking effect on anything Vercel serves,
 *    even if the env var above were ever set there by mistake.
 *
 * Only middleware.ts and src/lib/auth.ts's getCurrentUser should ever
 * consult this — never wire it into anything else.
 */

/** The one seeded e2e user (see prisma/seed.ts's SEED_USER_ID) every
 * e2e test runs as, via the login shortcut route below. */
export const E2E_TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Cookie the shortcut route sets and middleware/getCurrentUser read —
 * deliberately not named anything resembling a real Supabase auth
 * cookie, so the two are never confused. */
export const E2E_TEST_USER_COOKIE = "e2e-test-user-id";

export function isE2ETestAuthEnabled(): boolean {
  return process.env.E2E_TEST_AUTH_ENABLED === "1" && !process.env.VERCEL;
}

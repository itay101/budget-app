import { chromium, type FullConfig } from "@playwright/test";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

/**
 * Runs once before the whole suite (Playwright guarantees webServer is
 * already up by this point) — visits the e2e-only login shortcut
 * (src/app/api/e2e-test-login/route.ts, #72/docs/adr/0006) once and
 * saves the resulting cookie as shared storage state, so every test
 * (playwright.config.ts's `use.storageState`) starts already signed in
 * as prisma/seed.ts's seeded owner, without going through the real
 * Supabase login UI at all.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL as string;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/api/e2e-test-login?userId=${E2E_TEST_USER_ID}`);
  await page.context().storageState({ path: "e2e/.auth/user.json" });
  await browser.close();
}

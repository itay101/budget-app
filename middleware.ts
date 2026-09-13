import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { E2E_TEST_USER_COOKIE, isE2ETestAuthEnabled } from "@/lib/e2eTestAuth";

export async function middleware(request: NextRequest) {
  // The e2e test-only login shortcut (#72, docs/adr/0006): if a test has
  // already visited /api/e2e-test-login (see e2e/global-setup.ts) and
  // carries its cookie, skip the real Supabase session check entirely —
  // src/lib/auth.ts's getCurrentUser() is what actually resolves this
  // cookie into a User for the rest of the app. Both conditions in
  // isE2ETestAuthEnabled() must hold for this branch to ever run.
  if (
    isE2ETestAuthEnabled() &&
    request.cookies.get(E2E_TEST_USER_COOKIE)
  ) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every request except:
     * - Next.js internals (_next/static, _next/image)
     * - static asset files (favicon, icons, etc.)
     * - the cron keepalive endpoint, which authenticates via CRON_SECRET
     *   (see src/app/api/cron/keepalive/route.ts), not a user session
     * - the e2e login shortcut itself (#72) — it sets the cookie the
     *   branch above checks for, so it can't require that cookie already
     *   be present without a chicken-and-egg problem
     */
    "/((?!_next/static|_next/image|favicon.ico|apple-icon|icon|api/cron|api/e2e-test-login).*)",
  ],
};

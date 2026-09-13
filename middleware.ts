import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // The e2e test-only login shortcut (#72) hooks in here, ahead of the
  // real Supabase session check below — see docs/adr/0006. It must stay
  // narrowly gated (an env var set only in Playwright's own webServer
  // process, plus a hard `!process.env.VERCEL` check) so it can never
  // fire outside a locally-run e2e process.

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
     */
    "/((?!_next/static|_next/image|favicon.ico|apple-icon|icon|api/cron).*)",
  ],
};

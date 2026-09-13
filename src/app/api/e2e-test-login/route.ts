import { NextResponse } from "next/server";
import { E2E_TEST_USER_COOKIE, isE2ETestAuthEnabled } from "@/lib/e2eTestAuth";
import { prisma } from "@/lib/prisma";
import { acceptPendingInvites } from "@/lib/invites";

// Always run this on request — never prerender/cache it.
export const dynamic = "force-dynamic";

/**
 * The e2e-only login shortcut itself (#72, docs/adr/0006). Called once
 * by e2e/global-setup.ts, which then saves the resulting cookie as
 * Playwright's shared storageState — not visited by individual tests. A
 * test that needs to sign in as someone else mid-run (e.g. an invited
 * user accepting on "sign-in", see e2e/invites.spec.ts) can also hit it
 * directly with a different `userId`.
 *
 * 404s outright (not just "unauthorized" — this route shouldn't even
 * appear to exist) unless isE2ETestAuthEnabled() is true, which itself
 * requires both E2E_TEST_AUTH_ENABLED="1" (set only in
 * playwright.config.ts's webServer.env) and no VERCEL env var (Vercel
 * sets VERCEL=1 on every deployment it runs, previews included).
 */
export async function GET(request: Request) {
  if (!isE2ETestAuthEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Mirrors what the real magic-link callback does on an actual sign-in
  // (src/app/auth/callback/route.ts): e2e has no real Supabase project
  // to sign in through, so this shortcut is e2e's only equivalent
  // "sign-in" moment for exercising #73's accept-on-sign-in behavior.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) {
    await acceptPendingInvites(user);
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(E2E_TEST_USER_COOKIE, userId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  return response;
}

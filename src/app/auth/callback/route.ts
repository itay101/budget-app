import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { acceptPendingInvites } from "@/lib/invites";

// Always run this on request — it exchanges a one-time code for a
// session, never something to prerender or cache.
export const dynamic = "force-dynamic";

/**
 * Where Supabase's magic-link email points. Exchanges the `code` query
 * param for a real session (setting the session cookie via the server
 * client), then sends the user on to wherever they were headed —
 * middleware.ts stashed that as `?next=` when it first redirected them
 * to /sign-in.
 *
 * This is also the "on sign-in" moment #73/ADR 0003 means for accepting
 * a pending Invite: right after a session exists, before the redirect,
 * any Invite addressed to this email is converted into a
 * BudgetMembership (see acceptPendingInvites's doc comment for why this
 * lives here rather than in getCurrentUser).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user) {
        const user = await prisma.user.findUnique({
          where: { id: data.user.id },
        });
        if (user) {
          await acceptPendingInvites(user);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const signInUrl = new URL("/sign-in", origin);
  signInUrl.searchParams.set("error", "Sign-in link is invalid or expired");
  return NextResponse.redirect(signInUrl);
}

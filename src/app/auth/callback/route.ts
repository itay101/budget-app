import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { acceptPendingInvites } from "@/lib/invites";

// Always run this on request — it exchanges a one-time code for a
// session, never something to prerender or cache.
export const dynamic = "force-dynamic";

// How close `created_at`/`last_sign_in_at` must be to count as "this
// auth.users row was just created by this very request" — see the
// invite-only gate below. A few seconds of slack for clock/transaction
// rounding, nowhere near long enough to misfire on a real returning user.
const JUST_CREATED_SLACK_MS = 5_000;

/**
 * Where Supabase's magic-link email *and* the "Continue with Google"
 * button (src/app/sign-in/actions.ts's signInWithGoogle) both point.
 * Exchanges the `code` query param for a real session (setting the
 * session cookie via the server client), then sends the user on to
 * wherever they were headed — middleware.ts stashed that as `?next=`
 * when it first redirected them to /sign-in.
 *
 * This is also the "on sign-in" moment #73/ADR 0003 means for accepting
 * a pending Invite: right after a session exists, before the redirect,
 * any Invite addressed to this email is converted into a
 * BudgetMembership (see acceptPendingInvites's doc comment for why this
 * lives here rather than in getCurrentUser).
 *
 * Invite-only gate (#86): magic-link sign-in never creates a fresh
 * auth.users row for an uninvited email (ADR 0003 — inviteUserByEmail is
 * the only thing that does, and only an Owner's invite calls it). OAuth
 * doesn't have that property — signInWithOAuth happily creates a
 * brand-new, already-confirmed auth.users row for *any* Google account
 * on its first callback. So: if this code exchange just now created a
 * brand-new account (`created_at` ~= `last_sign_in_at`, i.e. this is
 * that account's very first sign-in ever) and there's no pending Invite
 * for the email, nobody invited this person — undo the account Supabase
 * just created rather than let them in. A previously-invited email
 * signing in via Google for the first time is unaffected: either a
 * pending Invite still exists for it (ordinary invite flow, #73), or the
 * account itself predates this request (bootstrap/an already-consumed
 * invite, matched by email and linked to the same auth.users row rather
 * than creating a new one), so `created_at` won't match `last_sign_in_at`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const email = data.user.email?.toLowerCase();
      const invite = email
        ? await prisma.invite.findFirst({ where: { email } })
        : null;
      const createdAt = new Date(data.user.created_at).getTime();
      const lastSignInAt = data.user.last_sign_in_at
        ? new Date(data.user.last_sign_in_at).getTime()
        : createdAt;
      const justCreatedAccount =
        Math.abs(lastSignInAt - createdAt) < JUST_CREATED_SLACK_MS;

      if (!invite && justCreatedAccount) {
        await createAdminClient().auth.admin.deleteUser(data.user.id);
        await supabase.auth.signOut().catch(() => {});
        const signInUrl = new URL("/sign-in", origin);
        signInUrl.searchParams.set(
          "error",
          "This app is invite-only — ask an existing member to invite you.",
        );
        return NextResponse.redirect(signInUrl);
      }

      const user = await prisma.user.findUnique({
        where: { id: data.user.id },
      });
      if (user) {
        await acceptPendingInvites(user);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const signInUrl = new URL("/sign-in", origin);
  signInUrl.searchParams.set("error", "Sign-in link is invalid or expired");
  return NextResponse.redirect(signInUrl);
}

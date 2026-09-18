"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends a magic-link sign-in email. There's no signup form anywhere in
 * this app — signup is invite-only (see #56) — so this same action
 * covers both a brand-new invitee's first sign-in and an existing user's
 * ordinary one; `signInWithOtp` doesn't distinguish the two; Supabase
 * simply emails a link either way. Converting a pending Invite into a
 * BudgetMembership on that first sign-in is #73's job, not this one.
 */
export async function sendSignInLink(
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = String(formData.get("next") ?? "");

  if (!email) {
    return { error: "Email is required" };
  }

  const supabase = createClient();
  const origin = headers().get("origin");
  const callbackUrl = new URL("/auth/callback", origin ?? undefined);
  if (next) {
    callbackUrl.searchParams.set("next", next);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { sent: true };
}

/**
 * Starts a Google sign-in (#86): redirects the browser to Google's
 * consent screen, which itself redirects back to /auth/callback with a
 * `code` — the exact same code-exchange path the magic-link email uses,
 * just reached a different way. Unlike `sendSignInLink` above, this
 * doesn't itself decide who's allowed in: signInWithOAuth will happily
 * create a brand-new Supabase account for any Google account, invited or
 * not, so the invite-only check has to happen after the fact, in the
 * callback route once we actually know who signed in — see its doc
 * comment.
 *
 * Only returns (with an error) if Supabase couldn't even start the OAuth
 * flow (e.g. the Google provider isn't configured); on success this
 * redirects and never returns, same as any other Server Action `redirect`.
 */
export async function signInWithGoogle(
  formData: FormData,
): Promise<{ error?: string }> {
  const next = String(formData.get("next") ?? "");

  const supabase = createClient();
  const origin = headers().get("origin");
  const callbackUrl = new URL("/auth/callback", origin ?? undefined);
  if (next) {
    callbackUrl.searchParams.set("next", next);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    return { error: error?.message ?? "Could not start Google sign-in" };
  }

  redirect(data.url);
}

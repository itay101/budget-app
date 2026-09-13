"use server";

import { headers } from "next/headers";
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

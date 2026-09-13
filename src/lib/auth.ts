import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

/**
 * The signed-in user, for Server Components/Actions to authorize
 * against. middleware.ts already redirects a signed-out request to
 * /sign-in before it reaches here, so the `redirect` below is a
 * defensive backstop (e.g. a session that expired between the
 * middleware check and this call), not the primary gate.
 *
 * The public."User" row is expected to already exist by the time this
 * runs — the mirror trigger (prisma/migrations/20260913120000_add_auth_and_sharing)
 * inserts it the moment the Supabase auth user is created, before any
 * sign-in is even possible.
 *
 * This is the single chokepoint #71 builds "does this user own/
 * collaborate on this Budget" authorization on top of.
 */
export async function getCurrentUser(): Promise<User> {
  const supabase = createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({ where: { id: supabaseUser.id } });
  if (!user) {
    throw new Error(
      `No public.User row for authenticated Supabase user ${supabaseUser.id} — the auth.users mirror trigger should have created one`,
    );
  }

  return user;
}

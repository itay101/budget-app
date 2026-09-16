import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Invite, User } from "@prisma/client";

/**
 * Revokes a single pending Invite: deletes the unconfirmed Supabase user
 * it created (if any) before removing the local row (ADR 0003) — if the
 * Supabase call failed but the local row were deleted anyway, the old
 * invite link would keep working with no local record left to accept it
 * into. Shared between `cancelInvite`
 * (src/app/budgets/inviteActions.ts, the Owner-facing action) and account
 * deactivation (src/app/auth/actions.ts, ADR 0004 — canceling a Budget's
 * pending Invites as part of its automatic soft-delete).
 */
export async function revokeInvite(invite: Invite): Promise<void> {
  if (invite.createdSupabaseUser) {
    // Invite only records *that* it created an auth.users row, not that
    // row's id — re-derived here via the mirrored public.User row for
    // this email, which always shares that id verbatim (ADR 0005).
    const invitedUser = await prisma.user.findFirst({
      where: { email: invite.email, deactivatedAt: null },
    });
    if (invitedUser) {
      const { error } = await createAdminClient().auth.admin.deleteUser(
        invitedUser.id,
      );
      if (error) {
        throw new Error(`Failed to cancel invite: ${error.message}`);
      }
    }
  }
  await prisma.invite.delete({ where: { id: invite.id } });
}

/**
 * Converts every pending Invite addressed to this user's email into a
 * BudgetMembership, deleting each Invite row as it's consumed — an
 * Invite's mere existence *is* its "pending" status (ADR 0003/0005), so
 * acceptance removes the row exactly like cancellation does; there's no
 * separate "accepted" state to record. A user can in principle have more
 * than one pending Invite (invited to several Budgets before ever
 * signing in) — this accepts all of them in one pass, not just the first.
 *
 * Call this once, at the moment a sign-in actually completes — never
 * from getCurrentUser, which runs many times over the life of a single
 * request and would otherwise re-run this pointlessly on every one of
 * them:
 *  - src/app/auth/callback/route.ts, right after a real Supabase
 *    magic-link sign-in exchanges its code for a session.
 *  - src/app/api/e2e-test-login/route.ts, for e2e's login shortcut
 *    (#72/docs/adr/0006) — e2e's disposable Postgres has no real
 *    Supabase project to sign in through, so that route is e2e's only
 *    equivalent "sign-in" moment, and this is what lets e2e exercise
 *    accept-on-sign-in for real.
 */
export async function acceptPendingInvites(user: User): Promise<void> {
  const invites = await prisma.invite.findMany({
    where: { email: user.email },
  });
  if (invites.length === 0) {
    return;
  }

  await prisma.$transaction([
    ...invites.map((invite) =>
      prisma.budgetMembership.upsert({
        where: {
          budgetId_userId: { budgetId: invite.budgetId, userId: user.id },
        },
        create: { budgetId: invite.budgetId, userId: user.id },
        update: {},
      }),
    ),
    prisma.invite.deleteMany({
      where: { id: { in: invites.map((invite) => invite.id) } },
    }),
  ]);
}

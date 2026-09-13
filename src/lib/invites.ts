import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

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

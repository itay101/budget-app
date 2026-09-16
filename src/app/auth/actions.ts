"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { CURRENT_BUDGET_COOKIE, softDeleteBudget } from "@/lib/budget";
import { getCurrentUser } from "@/lib/auth";
import { revokeInvite } from "@/lib/invites";
import { diffFields, recordAuditEntries } from "@/lib/audit";

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

/**
 * "Delete your account" (ADR 0004): deactivates the signed-in User —
 * never removes the row (ADR 0005) — and truly deletes their underlying
 * Supabase credentials, so they can no longer sign in.
 *
 * Blocked while the User owns any Budget that still has Collaborators —
 * checked exactly the way the DB-level backstop
 * (`before_user_deactivated`, prisma/migrations/20260913120000_add_auth_and_sharing)
 * does, deleted budgets included, so this pre-check and that trigger
 * never disagree; the caller must transfer ownership or delete each such
 * Budget first (surfaced as the returned `error`, for the UI to show).
 * Any Budget owned outright with no Collaborators is soft-deleted
 * automatically, canceling its pending Invites as part of that —
 * nobody else is affected, so there's nothing to block on. The User's
 * own `BudgetMembership` rows (their collaborations elsewhere) are
 * dropped too, same as `leaveBudget`.
 *
 * Local writes happen before the external `admin.deleteUser` call, not
 * after: if the Supabase call then failed, the User is left deactivated
 * with live credentials rather than the other way around (deleted
 * credentials but a still-active row claiming Budgets and memberships).
 */
export async function deactivateAccount(): Promise<{ error?: string }> {
  const user = await getCurrentUser();

  const blockingBudget = await prisma.budget.findFirst({
    where: { ownerId: user.id, memberships: { some: {} } },
    select: { name: true },
  });
  if (blockingBudget) {
    return {
      error: `Transfer ownership or delete "${blockingBudget.name}" first — it still has collaborators.`,
    };
  }

  const ownedBudgets = await prisma.budget.findMany({
    where: { ownerId: user.id, deleted: false },
    select: { id: true },
  });
  for (const budget of ownedBudgets) {
    const invites = await prisma.invite.findMany({
      where: { budgetId: budget.id },
    });
    for (const invite of invites) {
      await revokeInvite(invite, user.id);
    }
    await softDeleteBudget(budget.id, user.id);
  }

  // The User's own collaborations elsewhere are dropped the same way
  // leaveBudget drops one — same "collaborator removed" AuditEntry
  // action, `actorId` the deactivating user themselves.
  const memberships = await prisma.budgetMembership.findMany({
    where: { userId: user.id },
    select: { id: true, budgetId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.budgetMembership.deleteMany({ where: { userId: user.id } });
    await recordAuditEntries(
      tx,
      memberships.map((membership) => ({
        budgetId: membership.budgetId,
        entityType: "BUDGET_MEMBERSHIP" as const,
        entityId: membership.id,
        action: "collaborator removed",
        actorId: user.id,
        changes: diffFields({ userId: user.id }, {}),
      })),
    );
    await tx.user.update({
      where: { id: user.id },
      data: { deactivatedAt: new Date() },
    });
  });

  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) {
    throw new Error(`Failed to delete account credentials: ${error.message}`);
  }

  // admin.deleteUser above already killed this session server-side (the
  // underlying auth.users row is gone), so a client-side signOut call
  // failing here doesn't leave anything actually signed in — it just
  // clears the local session cookie, best-effort.
  const supabase = createClient();
  await supabase.auth.signOut().catch(() => {});
  cookies().delete(CURRENT_BUDGET_COOKIE);
  redirect("/sign-in");
}

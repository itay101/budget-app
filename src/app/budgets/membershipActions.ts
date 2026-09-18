"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CURRENT_BUDGET_COOKIE } from "@/lib/budget";
import { getCurrentUser } from "@/lib/auth";
import { requireBudgetOwnership } from "@/lib/authorization";
import { diffFields, recordAuditEntry } from "@/lib/audit";

/**
 * Removes a Collaborator from a Budget (Owner-initiated). Per ADR 0004,
 * this is the same underlying change `leaveBudget` below makes — the
 * `BudgetMembership` row is deleted immediately, no grace period — the
 * two are only distinguished by who's acting, recorded in the shared
 * "collaborator removed" AuditEntry's `actorId` (#75).
 *
 * Owner-only, authorized via the Budget itself: a non-owner gets the
 * same "Budget not found" a stranger would (requireBudgetOwnership).
 */
export async function removeCollaborator(formData: FormData): Promise<void> {
  const budgetId = String(formData.get("budgetId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!budgetId) {
    throw new Error("budgetId is required");
  }
  if (!userId) {
    throw new Error("userId is required");
  }

  const { user } = await requireBudgetOwnership(budgetId);

  const membership = await prisma.budgetMembership.findUnique({
    where: { budgetId_userId: { budgetId, userId } },
  });
  if (!membership) {
    throw new Error("Not a collaborator on this budget");
  }

  await prisma.$transaction(async (tx) => {
    await tx.budgetMembership.delete({ where: { id: membership.id } });
    await recordAuditEntry(tx, {
      budgetId,
      entityType: "BUDGET_MEMBERSHIP",
      entityId: membership.id,
      action: "collaborator removed",
      actorId: user.id,
      changes: diffFields({ userId }, {}),
    });
  });
  revalidatePath("/", "layout");
}

/**
 * Leaves a Budget (Collaborator-initiated) — the other half of ADR
 * 0004's "removal and leaving both just delete the BudgetMembership
 * row". Not available to the Owner: they have no BudgetMembership row
 * to delete (ADR 0001) and must transfer ownership or delete the Budget
 * instead, so an Owner calling this simply finds no membership and gets
 * the same error a non-collaborator would.
 *
 * Clears the current-budget cookie if it pointed at the budget just
 * left, mirroring deleteBudget's own cleanup — otherwise the next
 * request would try to resolve a cookie to a Budget this user can no
 * longer see.
 */
export async function leaveBudget(formData: FormData): Promise<void> {
  const budgetId = String(formData.get("budgetId") ?? "");
  if (!budgetId) {
    throw new Error("budgetId is required");
  }

  const user = await getCurrentUser();

  const membership = await prisma.budgetMembership.findUnique({
    where: { budgetId_userId: { budgetId, userId: user.id } },
  });
  if (!membership) {
    throw new Error("You're not a collaborator on this budget");
  }

  await prisma.$transaction(async (tx) => {
    await tx.budgetMembership.delete({ where: { id: membership.id } });
    await recordAuditEntry(tx, {
      budgetId,
      entityType: "BUDGET_MEMBERSHIP",
      entityId: membership.id,
      action: "collaborator removed",
      actorId: user.id,
      changes: diffFields({ userId: user.id }, {}),
    });
  });

  if (cookies().get(CURRENT_BUDGET_COOKIE)?.value === budgetId) {
    cookies().delete(CURRENT_BUDGET_COOKIE);
  }
  revalidatePath("/", "layout");
}

/**
 * Transfers ownership of a Budget to one of its existing Collaborators.
 * Per ADR 0004, the outgoing Owner isn't dropped from the Budget —
 * they're converted into a Collaborator instead, atomically with the
 * `ownerId` swap, so handing off ownership never costs the outgoing
 * Owner their own access. The incoming Owner's now-redundant
 * `BudgetMembership` row is deleted in the same transaction, since
 * ADR 0001 keeps ownership and membership mutually exclusive — the
 * Owner relationship lives on `Budget.ownerId` alone.
 *
 * Owner-only (only the current Owner can hand off ownership), and the
 * new Owner must already be a Collaborator — this never grants budget
 * access, only re-labels an existing grant.
 */
export async function transferOwnership(formData: FormData): Promise<void> {
  const budgetId = String(formData.get("budgetId") ?? "");
  const newOwnerId = String(formData.get("userId") ?? "");
  if (!budgetId) {
    throw new Error("budgetId is required");
  }
  if (!newOwnerId) {
    throw new Error("userId is required");
  }

  const { user: currentOwner } = await requireBudgetOwnership(budgetId);
  if (newOwnerId === currentOwner.id) {
    throw new Error("Already the owner of this budget");
  }

  const membership = await prisma.budgetMembership.findUnique({
    where: { budgetId_userId: { budgetId, userId: newOwnerId } },
  });
  if (!membership) {
    throw new Error("Only an existing collaborator can be made the owner");
  }

  await prisma.$transaction(async (tx) => {
    await tx.budget.update({ where: { id: budgetId }, data: { ownerId: newOwnerId } });
    await tx.budgetMembership.delete({ where: { id: membership.id } });
    await tx.budgetMembership.create({
      data: { budgetId, userId: currentOwner.id },
    });
    await recordAuditEntry(tx, {
      budgetId,
      entityType: "BUDGET_MEMBERSHIP",
      entityId: budgetId,
      action: "ownership transferred",
      actorId: currentOwner.id,
      changes: diffFields({ ownerId: currentOwner.id }, { ownerId: newOwnerId }),
    });
  });

  revalidatePath("/", "layout");
}

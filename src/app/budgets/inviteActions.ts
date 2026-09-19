"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { AuthError } from "@supabase/supabase-js";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireBudgetOwnership } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeInvite } from "@/lib/invites";
import { auditedCreate } from "@/lib/audit";

/**
 * Supabase's own stable error codes (see
 * https://supabase.com/docs/guides/auth/debugging/error-codes) for "this
 * email already has an `auth.users` row" — returned by
 * `admin.inviteUserByEmail` whether that existing row is a fully
 * confirmed account or still unconfirmed from an earlier invite. Per ADR
 * 0003, this single non-idempotent API call *is* the "does this email
 * already have an account" check — there's no separate lookup. The
 * message-substring fallback covers any Supabase deployment old enough
 * to predate stable error codes.
 */
function isAlreadyRegisteredError(error: AuthError): boolean {
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    /already registered|already exists/i.test(error.message)
  );
}

/**
 * Sends an Invite for the given email to collaborate on a Budget
 * (Owner-only). Per ADR 0003: an email with no existing `auth.users` row
 * gets a real Supabase invite email via `admin.inviteUserByEmail`
 * *and* the local `Invite` row (`createdSupabaseUser: true`); an email
 * that already has one (confirmed, or still-pending from another
 * invite) only ever gets the local `Invite` row (`createdSupabaseUser:
 * false`) — no email is sent for that case, since Supabase's invite API
 * would just reject it. That user is offered acceptance on their next
 * ordinary sign-in instead (src/lib/invites.ts).
 */
export async function sendInvite(
  formData: FormData,
): Promise<{ error?: string }> {
  const budgetId = String(formData.get("budgetId") ?? "");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!budgetId) {
    throw new Error("budgetId is required");
  }
  if (!email) {
    return { error: "Email is required" };
  }

  const { user } = await requireBudgetOwnership(budgetId);

  if (email === user.email) {
    return { error: "You can't invite yourself." };
  }

  const existingMembership = await prisma.budgetMembership.findFirst({
    where: { budgetId, user: { email } },
  });
  if (existingMembership) {
    return { error: `${email} is already a collaborator on this budget.` };
  }

  const existingInvite = await prisma.invite.findUnique({
    where: { budgetId_email: { budgetId, email } },
  });
  if (existingInvite) {
    return {
      error: `${email} already has a pending invite — cancel it, or use Resend, instead.`,
    };
  }

  const origin = (await headers()).get("origin");
  const callbackUrl = new URL("/auth/callback", origin ?? undefined);

  type InviteUserByEmailResult = Awaited<
    ReturnType<
      ReturnType<typeof createAdminClient>["auth"]["admin"]["inviteUserByEmail"]
    >
  >;
  let inviteResult: InviteUserByEmailResult;
  try {
    inviteResult = await createAdminClient().auth.admin.inviteUserByEmail(
      email,
      { redirectTo: callbackUrl.toString() },
    );
  } catch (err) {
    // createAdminClient()/inviteUserByEmail can throw synchronously (e.g. a
    // misconfigured SUPABASE_SERVICE_ROLE_KEY) rather than resolving with
    // an AuthError — surface that as an inline error too, instead of an
    // unhandled rejection that crashes the whole popover.
    return {
      error: err instanceof Error ? err.message : "Failed to send the invite.",
    };
  }
  const { data, error } = inviteResult;

  let createdSupabaseUser: boolean;
  if (error) {
    if (!isAlreadyRegisteredError(error)) {
      return { error: error.message };
    }
    createdSupabaseUser = false;
  } else {
    createdSupabaseUser = true;
  }

  try {
    await prisma.$transaction((tx) =>
      auditedCreate({
        tx,
        budgetId,
        entityType: "INVITE",
        actorId: user.id,
        action: "invite sent",
        apply: () =>
          tx.invite.create({
            data: { budgetId, email, invitedBy: user.id, createdSupabaseUser },
          }),
        entityId: (invite) => invite.id,
        fields: () => ({ email, createdSupabaseUser }),
      }),
    );
  } catch (err) {
    // The local write is what actually makes this Invite "exist" — if it
    // fails after inviteUserByEmail already created a Supabase user, undo
    // that too, rather than leaving a working invite link with no local
    // record able to accept it (the same hazard cancelInvite's ordering
    // guards against).
    if (createdSupabaseUser && data.user) {
      await createAdminClient().auth.admin.deleteUser(data.user.id);
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        error: `${email} already has a pending invite for this budget.`,
      };
    }
    throw err;
  }

  revalidatePath("/", "layout");
  return {};
}

/**
 * Cancels a pending Invite (Owner-initiated) — see revokeInvite
 * (src/lib/invites.ts) for the actual Supabase-then-local ordering this
 * relies on. Authorized via the Invite's own Budget — a non-owner gets
 * the same "Budget not found" a stranger would (requireBudgetOwnership).
 */
export async function cancelInvite(formData: FormData): Promise<void> {
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) {
    throw new Error("inviteId is required");
  }

  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) {
    throw new Error("Invite not found");
  }

  const { user } = await requireBudgetOwnership(invite.budgetId);

  await revokeInvite(invite, user.id);
  revalidatePath("/", "layout");
}

/**
 * Resend = cancel the pending Invite, then send a fresh one (ADR 0003 —
 * Supabase's invite API isn't idempotent, so there's no native "resend"
 * to call instead).
 */
export async function resendInvite(
  formData: FormData,
): Promise<{ error?: string }> {
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) {
    throw new Error("inviteId is required");
  }

  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) {
    throw new Error("Invite not found");
  }

  const cancelData = new FormData();
  cancelData.set("inviteId", inviteId);
  await cancelInvite(cancelData);

  const sendData = new FormData();
  sendData.set("budgetId", invite.budgetId);
  sendData.set("email", invite.email);
  return sendInvite(sendData);
}

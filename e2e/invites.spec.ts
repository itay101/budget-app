import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

/**
 * Exercises #73's accept-on-sign-in behavior end to end. sendInvite/
 * cancelInvite/resendInvite themselves call the real Supabase Admin API
 * (admin.inviteUserByEmail/deleteUser) and so can't run against e2e's
 * plain Postgres, which has no Supabase project behind it at all (see
 * docs/adr/0006) — this test instead creates the pending `Invite` row
 * directly, the same way an owner's sendInvite call would have left it
 * for an already-registered email (`createdSupabaseUser: false`), and
 * drives the rest through the real app.
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const INVITEE_ID = "00000000-0000-0000-0000-000000000002";
const INVITEE_EMAIL = "invitee@example.com";

test.describe("invite accept-on-sign-in", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("a pending Invite becomes a BudgetMembership the moment the invited email signs in", async ({
    page,
  }) => {
    const budget = await prisma.budget.findFirstOrThrow({
      where: { ownerId: E2E_TEST_USER_ID },
    });

    await prisma.invite.create({
      data: {
        email: INVITEE_EMAIL,
        budgetId: budget.id,
        invitedBy: E2E_TEST_USER_ID,
        createdSupabaseUser: false,
      },
    });
    await prisma.user.upsert({
      where: { id: INVITEE_ID },
      create: { id: INVITEE_ID, email: INVITEE_EMAIL },
      update: {},
    });

    // The e2e login shortcut is e2e's equivalent of "signing in" (see its
    // own doc comment) — this is the moment acceptPendingInvites runs,
    // synchronously, before the shortcut's redirect response is sent.
    await page.goto(`/api/e2e-test-login?userId=${INVITEE_ID}`);

    const membership = await prisma.budgetMembership.findUnique({
      where: {
        budgetId_userId: { budgetId: budget.id, userId: INVITEE_ID },
      },
    });
    expect(membership).not.toBeNull();

    const remainingInvite = await prisma.invite.findUnique({
      where: { budgetId_email: { budgetId: budget.id, email: INVITEE_EMAIL } },
    });
    expect(remainingInvite).toBeNull();

    // Not just the raw membership row - the shared budget actually
    // renders for the newly-invited collaborator.
    await page.goto("/budget");
    await expect(page.getByText(budget.name)).toBeVisible();
  });

  test("an email with no pending Invite is left alone on sign-in", async ({
    page,
  }) => {
    const uninvitedId = "00000000-0000-0000-0000-000000000003";
    await prisma.user.upsert({
      where: { id: uninvitedId },
      create: { id: uninvitedId, email: "no-invite@example.com" },
      update: {},
    });

    await page.goto(`/api/e2e-test-login?userId=${uninvitedId}`);

    // No accessible Budget yet -> getCurrentBudget's own fallback kicks
    // in and creates a fresh default one, same as any other brand-new
    // user with nothing shared with them.
    await page.goto("/budget");
    await expect(page.getByText("My Budget")).toBeVisible();

    const membershipCount = await prisma.budgetMembership.count({
      where: { userId: uninvitedId },
    });
    expect(membershipCount).toBe(0);
  });
});

import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_TEST_USER_ID } from "../src/lib/e2eTestAuth";

/**
 * Exercises #76's BudgetSwitcherPopover rework: the grouped "Your
 * budgets"/"Shared with you" sections, an owned row's inline collaborator
 * management (pending-invite cancel, collaborator remove), and a shared
 * row's "Leave" action — wired to #73/#74's actions rather than
 * reimplementing them. sendInvite itself calls the real Supabase Admin
 * API and so can't run here (see invites.spec.ts's own doc comment) —
 * every Invite/BudgetMembership row this test needs is instead seeded
 * directly, the same shape sendInvite/acceptPendingInvites would have
 * left it in.
 */
const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const COLLABORATOR_ID = "00000000-0000-0000-0000-000000000010";
const COLLABORATOR_EMAIL = "switcher-collaborator@example.com";
const OTHER_OWNER_ID = "00000000-0000-0000-0000-000000000011";
const OTHER_OWNER_EMAIL = "switcher-other-owner@example.com";
const PENDING_EMAIL = "switcher-pending-invite@example.com";

/** The row `<div>`/`<li>` containing the given visible text, for scoping
 * a click (e.g. a specific collaborator's own "Remove" button) to just
 * that row rather than the first match anywhere in the popover. */
function rowContaining(page: Page, text: string) {
  return page.getByText(text).locator("xpath=ancestor-or-self::*[contains(@class,'items-center')][1]");
}

test.describe("budget switcher collaborator management", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("an owner sees a pending invite and a collaborator, and can cancel/remove each", async ({
    page,
  }) => {
    const budget = await prisma.budget.findFirstOrThrow({
      where: { ownerId: E2E_TEST_USER_ID },
    });

    await prisma.user.upsert({
      where: { id: COLLABORATOR_ID },
      create: { id: COLLABORATOR_ID, email: COLLABORATOR_EMAIL },
      update: {},
    });
    await prisma.budgetMembership.upsert({
      where: { budgetId_userId: { budgetId: budget.id, userId: COLLABORATOR_ID } },
      create: { budgetId: budget.id, userId: COLLABORATOR_ID },
      update: {},
    });
    await prisma.invite.create({
      data: {
        email: PENDING_EMAIL,
        budgetId: budget.id,
        invitedBy: E2E_TEST_USER_ID,
        createdSupabaseUser: false,
      },
    });

    await page.goto("/budget");
    await page.getByRole("button", { name: new RegExp(budget.name) }).click();

    await expect(page.getByText("Your budgets", { exact: true })).toBeVisible();
    await page.getByTitle("Manage collaborators").click();
    await expect(page.getByText(COLLABORATOR_EMAIL)).toBeVisible();
    await expect(page.getByText(PENDING_EMAIL)).toBeVisible();

    await rowContaining(page, PENDING_EMAIL).getByTitle("Cancel invite").click();
    await expect(page.getByText(PENDING_EMAIL)).toHaveCount(0);
    expect(
      await prisma.invite.findUnique({
        where: { budgetId_email: { budgetId: budget.id, email: PENDING_EMAIL } },
      }),
    ).toBeNull();

    await rowContaining(page, COLLABORATOR_EMAIL)
      .getByTitle("Remove collaborator")
      .click();
    await expect(page.getByText(COLLABORATOR_EMAIL)).toHaveCount(0);
    expect(
      await prisma.budgetMembership.findUnique({
        where: { budgetId_userId: { budgetId: budget.id, userId: COLLABORATOR_ID } },
      }),
    ).toBeNull();
  });

  test("a budget shared with the signed-in user shows under 'Shared with you' and can be left", async ({
    page,
  }) => {
    await prisma.user.upsert({
      where: { id: OTHER_OWNER_ID },
      create: { id: OTHER_OWNER_ID, email: OTHER_OWNER_EMAIL },
      update: {},
    });
    const sharedBudget = await prisma.budget.create({
      data: { name: "E2E Shared Budget", currency: "GBP", ownerId: OTHER_OWNER_ID },
    });
    await prisma.budgetMembership.create({
      data: { budgetId: sharedBudget.id, userId: E2E_TEST_USER_ID },
    });

    const myBudget = await prisma.budget.findFirstOrThrow({
      where: { ownerId: E2E_TEST_USER_ID },
    });

    await page.goto("/budget");
    await page.getByRole("button", { name: new RegExp(myBudget.name) }).click();

    await expect(page.getByText("Shared with you", { exact: true })).toBeVisible();
    const sharedRow = page.locator("li").filter({ hasText: sharedBudget.name });
    await expect(sharedRow).toContainText(OTHER_OWNER_EMAIL);
    // No delete/manage-collaborators entry points on a budget this user
    // doesn't own (CONTEXT.md) — only the hover "Leave" action.
    await expect(sharedRow.getByTitle("Delete budget")).toHaveCount(0);
    await expect(sharedRow.getByTitle("Manage collaborators")).toHaveCount(0);

    await sharedRow.getByRole("button", { name: "Leave" }).click();

    // leaveBudget runs inside a startTransition — wait for the budget to
    // actually drop out of the re-rendered list (revalidatePath) rather
    // than racing the server action's own completion.
    await expect(page.locator("li").filter({ hasText: sharedBudget.name })).toHaveCount(0);

    expect(
      await prisma.budgetMembership.findUnique({
        where: {
          budgetId_userId: { budgetId: sharedBudget.id, userId: E2E_TEST_USER_ID },
        },
      }),
    ).toBeNull();
  });
});

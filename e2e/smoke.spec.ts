import { test, expect } from "@playwright/test";

/**
 * Read-only sanity checks that the app boots and its main pages render
 * against the seeded database (see prisma/seed.ts) - "Checking"/"Credit
 * Card" accounts, an "Immediate Obligations" category group, and one
 * "Weekly shop" transaction. These never write anything, so they're safe
 * to run in any order and alongside the mutating specs.
 */

test("home redirects to the budget page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/budget$/);
  await expect(
    page.getByRole("heading", { name: "Budget", level: 1 }),
  ).toBeVisible();
});

test("budget page lists the seeded category group and category", async ({
  page,
}) => {
  await page.goto("/budget");
  await expect(page.getByText("Immediate Obligations")).toBeVisible();
  await expect(page.getByText("Groceries", { exact: true })).toBeVisible();
  // Budgeted $500.00, activity -$84.99 (the seeded "Weekly shop" purchase).
  await expect(page.getByText("-$84.99")).toBeVisible();
});

test("accounts page lists the seeded accounts and on-budget total", async ({
  page,
}) => {
  await page.goto("/accounts");
  await expect(
    page.getByRole("heading", { name: "Accounts", level: 1 }),
  ).toBeVisible();
  // Credit Card is off-budget, so only Checking's $1,500.00 counts.
  await expect(page.getByText("On-budget total: $1,500.00")).toBeVisible();
  await expect(page.getByText("Checking")).toBeVisible();
  await expect(page.getByText("Credit Card")).toBeVisible();
});

test("sidebar navigates to an account's transaction list", async ({
  page,
}) => {
  await page.goto("/budget");
  await page.getByRole("link", { name: "Checking" }).click();
  await expect(page).toHaveURL(/\/accounts\/[^/]+$/);
  await expect(page.getByText("Weekly shop")).toBeVisible();
  await expect(page.getByText("Starting balance")).toBeVisible();
});

test("all accounts page aggregates transactions across accounts", async ({
  page,
}) => {
  await page.goto("/accounts/all");
  await expect(
    page.getByRole("heading", { name: "All Accounts", level: 1 }),
  ).toBeVisible();
  // Starting-balance transactions are deliberately excluded here (see
  // src/app/accounts/all/page.tsx), so only the grocery purchase shows.
  await expect(page.getByText("Weekly shop")).toBeVisible();
  await expect(page.getByText("Starting balance")).toHaveCount(0);
});

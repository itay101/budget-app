-- Follow-up to 20260913120000_add_auth_and_sharing (#70/ADR 0006):
-- Budget.ownerId shipped nullable because the User table+trigger didn't
-- exist yet to backfill against. By the time this migration runs,
-- scripts/bootstrap-first-owner.ts must already have been run once
-- against this database (creating the first User and backfilling every
-- pre-existing Budget's ownerId) — see that script's own comments and
-- docs/adr/0006. If any Budget still has a null ownerId when this runs,
-- the ALTER COLUMN below fails loudly rather than silently leaving a
-- Budget with no owner.

-- AlterTable
ALTER TABLE "Budget" ALTER COLUMN "ownerId" SET NOT NULL;

-- Also close a correctness gap the single-user version of this
-- constraint had: a bare `UNIQUE (currency) WHERE deleted = false`
-- would mean two different Users could never each have their own USD
-- budget. Scope it per-owner instead, now that ownerId is always set.

-- DropIndex
DROP INDEX "Budget_currency_active_key";

-- CreateIndex
CREATE UNIQUE INDEX "Budget_ownerId_currency_active_key" ON "Budget"("ownerId", "currency") WHERE "deleted" = false;

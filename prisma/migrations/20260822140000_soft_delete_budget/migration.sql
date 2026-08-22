-- AlterTable
ALTER TABLE "Budget" ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false;

-- DropIndex
--
-- Replaced by a partial index below: a deleted budget shouldn't hold its
-- currency hostage forever, so uniqueness is only enforced among budgets
-- that aren't deleted.
DROP INDEX "Budget_currency_key";

-- CreateIndex
CREATE UNIQUE INDEX "Budget_currency_active_key" ON "Budget"("currency") WHERE "deleted" = false;

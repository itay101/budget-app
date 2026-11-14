-- CreateEnum
CREATE TYPE "CategoryGroupSystemKind" AS ENUM ('INFLOW');

-- CreateEnum
CREATE TYPE "CategorySystemKind" AS ENUM ('READY_TO_ASSIGN');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "systemKind" "CategorySystemKind";

-- AlterTable
ALTER TABLE "CategoryGroup" ADD COLUMN     "systemKind" "CategoryGroupSystemKind";

-- CreateIndex
CREATE UNIQUE INDEX "CategoryGroup_budgetId_systemKind_key" ON "CategoryGroup"("budgetId", "systemKind");


-- Data step (ADR 0008). Idempotent: a budget that already has its INFLOW
-- group is skipped, and only still-uncategorized Starting Balance rows
-- are touched, so re-running this changes nothing.
--
-- 1. Every Budget gets one system "Inflow" group holding its one
--    "Inflow: Ready to Assign" category. New budgets get the same from
--    createBudgetWithDefaults (src/lib/systemCategories.ts).
-- 2. On on-budget cash Accounts (not CREDIT_CARD / LINE_OF_CREDIT, see
--    isDebtAccountType), the Starting Balance row is categorized
--    Inflow: Ready to Assign. Per ADR 0008's Consequences, nothing else
--    is re-categorized: past uncategorized paychecks stay uncategorized.
DO $$
DECLARE
  b RECORD;
  group_id TEXT;
BEGIN
  FOR b IN
    SELECT id FROM "Budget" bu
    WHERE NOT EXISTS (
      SELECT 1 FROM "CategoryGroup" g
      WHERE g."budgetId" = bu.id AND g."systemKind" = 'INFLOW'
    )
  LOOP
    group_id := 'mig_' || substr(md5(random()::text || clock_timestamp()::text || b.id), 1, 20);
    INSERT INTO "CategoryGroup" (id, "budgetId", name, "sortOrder", "systemKind")
    VALUES (group_id, b.id, 'Inflow', -1, 'INFLOW');

    INSERT INTO "Category" (id, "categoryGroupId", name, "sortOrder", hidden, "systemKind")
    VALUES (
      'mig_' || substr(md5(random()::text || clock_timestamp()::text || group_id), 1, 20),
      group_id,
      'Inflow: Ready to Assign',
      0,
      false,
      'READY_TO_ASSIGN'
    );
  END LOOP;
END $$;

UPDATE "Transaction" t
SET "categoryId" = c.id, "updatedAt" = now()
FROM "Account" a, "Payee" p, "CategoryGroup" g, "Category" c
WHERE t."accountId" = a.id
  AND t."payeeId" = p.id
  AND p.name = 'Starting Balance'
  AND t."categoryId" IS NULL
  AND a."onBudget" = true
  AND a.type NOT IN ('CREDIT_CARD', 'LINE_OF_CREDIT')
  AND g."budgetId" = a."budgetId"
  AND g."systemKind" = 'INFLOW'
  AND c."categoryGroupId" = g.id
  AND c."systemKind" = 'READY_TO_ASSIGN';

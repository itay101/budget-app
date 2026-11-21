-- Payment Categories (ADR 0010). One ordinary Category per on-budget
-- Credit Card or Line of Credit, in a system "Credit Card Payments"
-- group, linked by paymentForAccountId. Off-budget cards are left alone.
--
-- Past months are not stored. Activity and Available are derived at read
-- time, so creating the categories is the whole backfill: the next read
-- recomputes every month from history.
--
-- Idempotent: a budget that already has the group, or an account that
-- already has a Payment Category, is skipped.

ALTER TABLE "Category" ADD COLUMN "paymentForAccountId" TEXT;

CREATE UNIQUE INDEX "Category_paymentForAccountId_key" ON "Category"("paymentForAccountId");

ALTER TABLE "Category" ADD CONSTRAINT "Category_paymentForAccountId_fkey"
  FOREIGN KEY ("paymentForAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  b RECORD;
  a RECORD;
  group_id TEXT;
  category_id TEXT;
  sort_order INT;
  owner_id UUID;
BEGIN
  FOR b IN
    SELECT bu.id, bu."ownerId"
    FROM "Budget" bu
    WHERE EXISTS (
      SELECT 1 FROM "Account" acct
      WHERE acct."budgetId" = bu.id
        AND acct."onBudget" = true
        AND acct.type IN ('CREDIT_CARD', 'LINE_OF_CREDIT')
        AND NOT EXISTS (
          SELECT 1 FROM "Category" existing
          WHERE existing."paymentForAccountId" = acct.id
        )
    )
  LOOP
    owner_id := b."ownerId";

    SELECT g.id INTO group_id
    FROM "CategoryGroup" g
    WHERE g."budgetId" = b.id AND g."systemKind" = 'CREDIT_CARD_PAYMENTS';

    IF group_id IS NULL THEN
      group_id := 'ccgrp_' || substr(md5(b.id), 1, 20);
      INSERT INTO "CategoryGroup" (id, "budgetId", name, "sortOrder", "systemKind")
      VALUES (group_id, b.id, 'Credit Card Payments', 1000000, 'CREDIT_CARD_PAYMENTS');

      INSERT INTO "AuditEntry" (id, "budgetId", "entityType", "entityId", action, "actorId", changes, "createdAt")
      VALUES (
        'ccaud_' || substr(md5(group_id), 1, 20),
        b.id,
        'CATEGORY_GROUP',
        group_id,
        'created',
        owner_id,
        jsonb_build_object(
          'name', jsonb_build_array(NULL, 'Credit Card Payments'),
          'sortOrder', jsonb_build_array(NULL, 1000000),
          'systemKind', jsonb_build_array(NULL, 'CREDIT_CARD_PAYMENTS')
        ),
        now()
      );
    END IF;

    sort_order := COALESCE(
      (SELECT MAX(c."sortOrder") + 1 FROM "Category" c WHERE c."categoryGroupId" = group_id),
      0
    );

    FOR a IN
      SELECT acct.id, acct.name, acct.closed
      FROM "Account" acct
      WHERE acct."budgetId" = b.id
        AND acct."onBudget" = true
        AND acct.type IN ('CREDIT_CARD', 'LINE_OF_CREDIT')
        AND NOT EXISTS (
          SELECT 1 FROM "Category" existing
          WHERE existing."paymentForAccountId" = acct.id
        )
      ORDER BY acct."createdAt", acct.id
    LOOP
      category_id := 'ccpay_' || substr(md5(a.id), 1, 20);
      INSERT INTO "Category" (
        id, "categoryGroupId", name, "sortOrder", hidden, "paymentForAccountId"
      )
      VALUES (category_id, group_id, a.name, sort_order, a.closed, a.id);

      INSERT INTO "AuditEntry" (id, "budgetId", "entityType", "entityId", action, "actorId", changes, "createdAt")
      VALUES (
        'ccaud_' || substr(md5(category_id), 1, 20),
        b.id,
        'CATEGORY',
        category_id,
        'created',
        owner_id,
        jsonb_build_object(
          'categoryGroupId', jsonb_build_array(NULL, group_id),
          'name', jsonb_build_array(NULL, a.name),
          'sortOrder', jsonb_build_array(NULL, sort_order),
          'hidden', jsonb_build_array(NULL, a.closed),
          'paymentForAccountId', jsonb_build_array(NULL, a.id)
        ),
        now()
      );

      sort_order := sort_order + 1;
    END LOOP;
  END LOOP;
END $$;

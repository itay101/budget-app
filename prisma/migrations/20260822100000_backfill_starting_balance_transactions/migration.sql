-- Data-only migration (no schema change).
--
-- Previously, an account's `balance` was set directly at creation time with
-- no transaction behind it, so an account could show a nonzero balance
-- while its transaction list was empty (or otherwise didn't sum to that
-- balance). New accounts are now given a real "Starting Balance"
-- transaction for this (see createAccount) — this backfills the same for
-- every account that already exists, by inserting one reconciling
-- "Starting Balance" transaction per account for the difference between
-- its current balance and what its existing transactions already sum to.
--
-- Idempotent: once an account's transactions sum to its balance, the
-- computed difference is 0 and it's skipped, so re-running this (or running
-- it after createAccount/seed.ts have already reconciled an account) is a
-- no-op.
DO $$
DECLARE
  acct RECORD;
  payee_id TEXT;
  tx_sum INTEGER;
  diff INTEGER;
BEGIN
  FOR acct IN SELECT id, "budgetId", balance FROM "Account" LOOP
    SELECT COALESCE(SUM(amount), 0) INTO tx_sum
    FROM "Transaction"
    WHERE "accountId" = acct.id;

    diff := acct.balance - tx_sum;

    IF diff <> 0 THEN
      SELECT id INTO payee_id
      FROM "Payee"
      WHERE "budgetId" = acct."budgetId" AND name = 'Starting Balance'
      LIMIT 1;

      IF payee_id IS NULL THEN
        payee_id := 'mig_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20);
        INSERT INTO "Payee" (id, "budgetId", name)
        VALUES (payee_id, acct."budgetId", 'Starting Balance');
      END IF;

      INSERT INTO "Transaction" (
        id, "accountId", "payeeId", date, amount, memo,
        cleared, approved, "createdAt", "updatedAt"
      )
      VALUES (
        'mig_' || substr(md5(random()::text || clock_timestamp()::text || acct.id), 1, 20),
        acct.id,
        payee_id,
        now(),
        diff,
        'Starting balance',
        'RECONCILED',
        true,
        now(),
        now()
      );
    END IF;
  END LOOP;
END $$;

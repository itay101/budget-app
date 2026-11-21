-- Replaces the Transfer delete trigger from
-- 20261119120000_add_transfer_transaction_link.
--
-- That trigger ran BEFORE DELETE and cleared the link on the row being
-- deleted. Postgres rejects a BEFORE trigger that modifies its own row
-- ("tuple to be deleted was already modified by an operation triggered by
-- the current command"), so any delete that reached a still-linked row
-- failed: deleting one side directly, or an Account/Budget cascade.
--
-- This version runs AFTER DELETE, when the row is already gone, and never
-- touches it. The foreign key is DEFERRABLE INITIALLY DEFERRED, so the
-- counterpart may still point at the deleted row until it is deleted here
-- (or the transaction commits).
--
-- It also takes the counterpart's amount back out of its Account's cached
-- balance, which a cascade from the other Account would otherwise leave
-- stale. When both sides go in one statement (a Budget cascade), the
-- counterpart is already gone and nothing more happens.
--
-- App-level deletes clear both links first (deleteTransferRows), so this
-- trigger finds no counterpart for them and leaves balances and audit
-- entries to the action.

DROP TRIGGER IF EXISTS "Transaction_delete_transfer_counterpart" ON "Transaction";

CREATE OR REPLACE FUNCTION delete_transfer_counterpart()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  counterpart RECORD;
BEGIN
  DELETE FROM "Transaction"
  WHERE id <> OLD.id
    AND (id = OLD."transferTransactionId" OR "transferTransactionId" = OLD.id)
  RETURNING id, "accountId", amount INTO counterpart;

  IF counterpart.id IS NOT NULL THEN
    UPDATE "Account"
    SET balance = balance - counterpart.amount
    WHERE id = counterpart."accountId";
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "Transaction_delete_transfer_counterpart"
AFTER DELETE ON "Transaction"
FOR EACH ROW
EXECUTE PROCEDURE delete_transfer_counterpart();

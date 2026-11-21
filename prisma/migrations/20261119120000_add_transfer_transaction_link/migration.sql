-- A Transfer is two Transaction rows that point at each other (ADR 0007).
-- The foreign key is DEFERRABLE so a Budget/Account cascade can delete both
-- sides in one statement; an immediate check would reject the first side
-- while the other still referenced it.

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "transferTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transferTransactionId_key" ON "Transaction"("transferTransactionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transferTransactionId_fkey" FOREIGN KEY ("transferTransactionId") REFERENCES "Transaction"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- Deleting one side deletes the other, including when a cascade reaches
-- only one of the rows. App-level deletes null both links first, so this
-- trigger leaves those alone and the action can write an audit entry per row.
CREATE OR REPLACE FUNCTION delete_transfer_counterpart()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  other_id TEXT;
BEGIN
  other_id := OLD."transferTransactionId";
  IF other_id IS NULL THEN
    SELECT id INTO other_id
    FROM "Transaction"
    WHERE "transferTransactionId" = OLD.id
    LIMIT 1;
  END IF;

  IF other_id IS NULL THEN
    RETURN OLD;
  END IF;

  UPDATE "Transaction"
  SET "transferTransactionId" = NULL
  WHERE id = other_id
     OR "transferTransactionId" IN (OLD.id, other_id);

  DELETE FROM "Transaction" WHERE id = other_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "Transaction_delete_transfer_counterpart"
BEFORE DELETE ON "Transaction"
FOR EACH ROW
EXECUTE PROCEDURE delete_transfer_counterpart();

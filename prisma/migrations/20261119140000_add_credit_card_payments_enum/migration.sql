-- Postgres cannot use a new enum value in the same transaction that adds
-- it. This migration only adds the value; the next one backfills rows
-- with it (ADR 0010).
ALTER TYPE "CategoryGroupSystemKind" ADD VALUE 'CREDIT_CARD_PAYMENTS';

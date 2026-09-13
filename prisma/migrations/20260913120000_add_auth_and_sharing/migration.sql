-- Authentication + budget sharing (#56/#69). See CONTEXT.md and
-- docs/adr/0001-0005 for the locked design; docs/adr/0006 for the
-- deviation this migration takes from ADR 0005's `Budget.ownerId String`
-- (required) — it's added here as nullable, and NOT NULL is added by a
-- later migration (see #71) once the bootstrap script
-- (scripts/bootstrap-first-owner.ts) has backfilled every pre-existing
-- Budget. Every *other* table here matches ADR 0005 exactly: they're
-- brand new, empty tables, so they have no such bootstrapping problem.

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM (
  'BUDGET',
  'ACCOUNT',
  'CATEGORY_GROUP',
  'CATEGORY',
  'CATEGORY_MONTH',
  'PAYEE',
  'TRANSACTION',
  'BUDGET_MEMBERSHIP',
  'INVITE'
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Partial: uniqueness only among active users, so a deactivated user's
-- old email frees up for a fresh invite/signup (see the User model's
-- doc comment in prisma/schema.prisma) — Prisma's DSL can't express
-- this, same precedent as "Budget_currency_active_key".
CREATE UNIQUE INDEX "User_email_active_key" ON "User"("email") WHERE "deactivatedAt" IS NULL;

-- CreateTable
CREATE TABLE "BudgetMembership" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetMembership_budgetId_userId_key" ON "BudgetMembership"("budgetId", "userId");

-- CreateIndex
CREATE INDEX "BudgetMembership_userId_idx" ON "BudgetMembership"("userId");

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "invitedBy" UUID NOT NULL,
    "createdSupabaseUser" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_budgetId_email_key" ON "Invite"("budgetId", "email");

-- CreateIndex
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEntry_budgetId_createdAt_idx" ON "AuditEntry"("budgetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEntry_entityType_entityId_idx" ON "AuditEntry"("entityType", "entityId");

-- AlterTable
-- Nullable for now — see this file's leading comment and the ownerId
-- doc comment in prisma/schema.prisma.
ALTER TABLE "Budget" ADD COLUMN "ownerId" UUID;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMembership" ADD CONSTRAINT "BudgetMembership_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMembership" ADD CONSTRAINT "BudgetMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Mirror auth.users into public."User" (ADR 0005): on signup, insert a
-- matching row; on email change, keep it in sync. security definer since
-- the app's own Postgres role doesn't otherwise have insert rights on
-- auth.users' triggers/schema.
--
-- The two functions below are plain trigger functions (they only touch
-- NEW.id/NEW.email, generic per-row fields any trigger call supplies) and
-- compile fine anywhere. The two CREATE TRIGGER statements that actually
-- attach them to auth.users are guarded behind `to_regclass('auth.users')`
-- and skipped everywhere that table doesn't exist — this app's local dev
-- (docker-compose.yml's `db`) and e2e (`db-e2e`) databases are plain
-- Postgres with no Supabase project (and so no `auth` schema) behind
-- them. Skipping the trigger there is harmless *for this migration*: it
-- only means nothing mirrors auth.users automatically in those
-- environments, which is already true today (there's no real GoTrue to
-- mirror from) and which #72's e2e login shortcut and any local seeding
-- work around directly (inserting a public."User" row themselves) rather
-- than relying on this trigger firing.
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public."User" (id, email, "createdAt", "updatedAt")
  VALUES (NEW.id, LOWER(NEW.email), NOW(), NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE FUNCTION public.handle_user_email_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public."User"
  SET email = LOWER(NEW.email), "updatedAt" = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user()';
    EXECUTE 'CREATE TRIGGER on_auth_user_email_updated AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_user_email_update()';
  END IF;
END;
$$;

-- DB-level backstop on "a Budget always has exactly one Owner" (ADR
-- 0001/0005): deactivating a User doesn't trip Budget_ownerId_fkey the
-- way a real delete would, so a bug in the app-level pre-check (verify no
-- owned Budget still has Collaborators before deactivating, per ADR 0004)
-- could otherwise silently orphan the invariant.
CREATE FUNCTION public.prevent_orphaning_owned_budgets()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."deactivatedAt" IS NULL AND NEW."deactivatedAt" IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "Budget" b
      JOIN "BudgetMembership" bm ON bm."budgetId" = b.id
      WHERE b."ownerId" = NEW.id
    ) THEN
      RAISE EXCEPTION 'cannot deactivate User %: still owns a Budget with Collaborators', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_user_deactivated
  BEFORE UPDATE ON public."User"
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_orphaning_owned_budgets();

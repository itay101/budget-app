-- CreateEnum
CREATE TYPE "TargetKind" AS ENUM ('SET_ASIDE', 'REFILL', 'BALANCE', 'NONE');

-- CreateEnum
CREATE TYPE "TargetCadence" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntityType" ADD VALUE 'CATEGORY_TARGET';
ALTER TYPE "AuditEntityType" ADD VALUE 'CATEGORY_TARGET_SNOOZE';

-- CreateTable
CREATE TABLE "CategoryTarget" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "startMonth" TIMESTAMP(3) NOT NULL,
    "kind" "TargetKind" NOT NULL,
    "cadence" "TargetCadence",
    "amount" INTEGER NOT NULL DEFAULT 0,
    "weekday" INTEGER,
    "dueDay" INTEGER,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryTargetSnooze" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryTargetSnooze_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryTarget_categoryId_startMonth_key" ON "CategoryTarget"("categoryId", "startMonth");

-- CreateIndex
CREATE INDEX "CategoryTargetSnooze_month_idx" ON "CategoryTargetSnooze"("month");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryTargetSnooze_categoryId_month_key" ON "CategoryTargetSnooze"("categoryId", "month");

-- AddForeignKey
ALTER TABLE "CategoryTarget" ADD CONSTRAINT "CategoryTarget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryTargetSnooze" ADD CONSTRAINT "CategoryTargetSnooze_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;


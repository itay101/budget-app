-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultBudgetId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultBudgetId_fkey" FOREIGN KEY ("defaultBudgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;


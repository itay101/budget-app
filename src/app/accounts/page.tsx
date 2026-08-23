import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { formatMilliunits } from "@/lib/money";
import { AccountsTable } from "@/components/AccountsTable";
import { updateAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const budget = await getCurrentBudget();

  // Includes closed accounts too — this page is where you'd reopen one,
  // so it can't filter them out the way the sidebar and budget do.
  const accounts = await prisma.account.findMany({
    where: { budgetId: budget.id },
    orderBy: { createdAt: "asc" },
  });

  const totalOnBudget = accounts
    .filter((a) => a.onBudget && !a.closed)
    .reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-300">
      <div>
        <h1 className="text-h2 text-neutral-800 sm:text-h1">Accounts</h1>
        <p className="text-body text-neutral-600">
          On-budget total: {formatMilliunits(totalOnBudget, budget.currency)}
        </p>
      </div>

      <AccountsTable
        accounts={accounts}
        currency={budget.currency}
        updateAccount={updateAccount}
      />
    </div>
  );
}

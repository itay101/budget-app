import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentBudget, listBudgets } from "@/lib/budget";
import { formatMilliunits, getCurrencySymbol } from "@/lib/money";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { createAccount } from "@/app/accounts/actions";
import { createBudget, renameBudget, switchBudget } from "@/app/budgets/actions";
import { AddAccountPopover } from "@/components/AddAccountPopover";
import { BudgetSwitcherPopover } from "@/components/BudgetSwitcherPopover";
import { SidebarNav } from "./SidebarNav";

export async function Sidebar() {
  const [budget, budgets] = await Promise.all([
    getCurrentBudget(),
    listBudgets(),
  ]);
  const accounts = await prisma.account.findMany({
    where: { budgetId: budget.id, closed: false },
    orderBy: { createdAt: "asc" },
  });

  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  const takenCurrencies = new Set(budgets.map((b) => b.currency));
  const availableCurrencies = CURRENCY_OPTIONS.filter(
    (c) => !takenCurrencies.has(c.code),
  );

  return (
    <nav className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-0 p-200">
      <div className="mb-300 text-h3 text-neutral-800">Budget App</div>

      <div className="mb-300">
        <BudgetSwitcherPopover
          currentBudget={budget}
          currencySymbol={getCurrencySymbol(budget.currency)}
          budgets={budgets}
          availableCurrencies={availableCurrencies}
          switchBudget={switchBudget}
          createBudget={createBudget}
          renameBudget={renameBudget}
        />
      </div>

      <SidebarNav />

      <div className="mt-300">
        <div className="px-3 text-small font-medium uppercase tracking-wide text-neutral-600">
          Accounts
        </div>
        <ul className="mt-1 space-y-0.5">
          <li>
            <Link
              href="/accounts/all"
              className="flex items-center justify-between gap-2 rounded px-3 py-1.5 text-small font-medium hover:bg-neutral-100"
            >
              <span className="text-neutral-800">All Accounts</span>
              <span
                className={
                  "shrink-0 " +
                  (total < 0 ? "text-danger" : "text-neutral-600")
                }
              >
                {formatMilliunits(total, budget.currency)}
              </span>
            </Link>
          </li>
          {accounts.map((account) => (
            <li key={account.id}>
              <Link
                href={`/accounts/${account.id}`}
                className="flex items-center justify-between gap-2 rounded px-3 py-1.5 text-small hover:bg-neutral-100"
              >
                <span className="truncate text-neutral-800">
                  {account.name}
                </span>
                <span
                  className={
                    "shrink-0 font-medium " +
                    (account.balance < 0 ? "text-danger" : "text-neutral-600")
                  }
                >
                  {formatMilliunits(account.balance, budget.currency)}
                </span>
              </Link>
            </li>
          ))}
          {accounts.length === 0 && (
            <li className="px-3 py-1.5 text-small text-neutral-600">
              No accounts yet
            </li>
          )}
        </ul>
        <AddAccountPopover createAccount={createAccount} />
      </div>
    </nav>
  );
}

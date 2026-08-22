import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBudget } from "@/lib/budget";
import { formatMilliunits } from "@/lib/money";
import { SidebarNav } from "./SidebarNav";

export async function Sidebar() {
  const budget = await getOrCreateDefaultBudget();
  const accounts = await prisma.account.findMany({
    where: { budgetId: budget.id, closed: false },
    orderBy: { createdAt: "asc" },
  });

  return (
    <nav className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-0 p-200">
      <div className="mb-300 text-h3 text-neutral-800">Budget App</div>

      <SidebarNav />

      <div className="mt-300">
        <div className="px-3 text-small font-medium uppercase tracking-wide text-neutral-600">
          Accounts
        </div>
        <ul className="mt-1 space-y-0.5">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between gap-2 px-3 py-1.5 text-small"
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
            </li>
          ))}
          {accounts.length === 0 && (
            <li className="px-3 py-1.5 text-small text-neutral-600">
              No accounts yet
            </li>
          )}
        </ul>
        <Link
          href="/accounts"
          className="mt-1 block rounded px-3 py-1.5 text-small font-medium text-brand-700 hover:bg-brand-700/10"
        >
          + Add account
        </Link>
      </div>
    </nav>
  );
}

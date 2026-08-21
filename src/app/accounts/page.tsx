import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBudget } from "@/lib/budget";
import { formatMilliunits } from "@/lib/money";
import { createAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const budget = await getOrCreateDefaultBudget();
  const accounts = await prisma.account.findMany({
    where: { budgetId: budget.id, closed: false },
    orderBy: { createdAt: "asc" },
  });

  const totalOnBudget = accounts
    .filter((a) => a.onBudget)
    .reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-slate-500">
          On-budget total: {formatMilliunits(totalOnBudget, budget.currency)}
        </p>
      </div>

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div>
              <div className="font-medium">{account.name}</div>
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {account.type.replace(/_/g, " ")}
                {!account.onBudget && " · off budget"}
              </div>
            </div>
            <div
              className={
                account.balance < 0 ? "text-red-600" : "text-slate-900"
              }
            >
              {formatMilliunits(account.balance, budget.currency)}
            </div>
          </li>
        ))}
        {accounts.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">
            No accounts yet — add one below.
          </li>
        )}
      </ul>

      <form
        action={createAccount}
        className="max-w-sm space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="font-medium">Add account</h2>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="type">
            Type
          </label>
          <select
            id="type"
            name="type"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="CHECKING">Checking</option>
            <option value="SAVINGS">Savings</option>
            <option value="CREDIT_CARD">Credit Card</option>
            <option value="CASH">Cash</option>
            <option value="LINE_OF_CREDIT">Line of Credit</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="balance">
            Starting balance
          </label>
          <input
            id="balance"
            name="balance"
            type="number"
            step="0.01"
            defaultValue={0}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Add account
        </button>
      </form>
    </div>
  );
}

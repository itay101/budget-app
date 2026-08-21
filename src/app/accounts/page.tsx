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
    <div className="space-y-300">
      <div>
        <h1 className="text-h1 text-neutral-800">Accounts</h1>
        <p className="text-body text-neutral-600">
          On-budget total: {formatMilliunits(totalOnBudget, budget.currency)}
        </p>
      </div>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-neutral-0">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex items-center justify-between px-200 py-3"
          >
            <div>
              <div className="text-body font-medium text-neutral-800">
                {account.name}
              </div>
              <div className="text-small uppercase tracking-wide text-neutral-600">
                {account.type.replace(/_/g, " ")}
                {!account.onBudget && " · off budget"}
              </div>
            </div>
            <div
              className={
                "text-body font-medium " +
                (account.balance < 0 ? "text-danger" : "text-neutral-800")
              }
            >
              {formatMilliunits(account.balance, budget.currency)}
            </div>
          </li>
        ))}
        {accounts.length === 0 && (
          <li className="px-200 py-300 text-body text-neutral-600">
            No accounts yet — add one below.
          </li>
        )}
      </ul>

      <form
        action={createAccount}
        className="max-w-sm space-y-3 rounded-lg border border-neutral-200 bg-neutral-0 p-200"
      >
        <h2 className="text-h3 text-neutral-800">Add account</h2>
        <div>
          <label className="block text-small text-neutral-600" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          />
        </div>
        <div>
          <label className="block text-small text-neutral-600" htmlFor="type">
            Type
          </label>
          <select
            id="type"
            name="type"
            className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
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
          <label
            className="block text-small text-neutral-600"
            htmlFor="balance"
          >
            Starting balance
          </label>
          <input
            id="balance"
            name="balance"
            type="number"
            step="0.01"
            defaultValue={0}
            className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-brand-700 px-4 py-2 text-body font-medium text-white hover:bg-brand-800 active:bg-brand-900"
        >
          Add account
        </button>
      </form>
    </div>
  );
}

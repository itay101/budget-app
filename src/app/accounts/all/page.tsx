import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { formatMilliunits } from "@/lib/money";
import { getTransactionEditOptions } from "@/lib/transactionOptions";
import { TransactionsTable } from "@/components/TransactionsTable";
import { updateTransaction, deleteTransaction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AllAccountsPage() {
  const budget = await getCurrentBudget();

  const [accounts, transactions, { categoryGroups, payeeNames }] =
    await Promise.all([
      prisma.account.findMany({
        where: { budgetId: budget.id, closed: false },
      }),
      prisma.transaction.findMany({
        where: {
          account: { budgetId: budget.id },
          // Starting-balance transactions (see createAccount) only make
          // sense in the context of the single account they seed — across
          // "All Accounts" they'd read as a stray, uncategorizable payee
          // with no real activity behind it, so they're excluded here.
          NOT: { payee: { name: "Starting Balance" } },
        },
        orderBy: { date: "desc" },
        include: {
          payee: true,
          category: true,
          account: { select: { name: true } },
        },
      }),
      getTransactionEditOptions(budget.id),
    ]);

  const total = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-300">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="text-h2 text-neutral-800 sm:text-h1">
            All Accounts
          </h1>
          <p className="text-body text-neutral-600">
            Every transaction across all {accounts.length} account
            {accounts.length === 1 ? "" : "s"}
          </p>
        </div>
        <div
          className={
            "text-h3 font-semibold sm:text-h2 " +
            (total < 0 ? "text-danger" : "text-success")
          }
        >
          {formatMilliunits(total, budget.currency)}
        </div>
      </div>

      <TransactionsTable
        transactions={transactions.map((t) => ({
          id: t.id,
          date: t.date.toISOString(),
          payeeName: t.payee?.name ?? "",
          categoryId: t.categoryId ?? "",
          memo: t.memo ?? "",
          amount: t.amount,
          accountName: t.account.name,
        }))}
        categoryGroups={categoryGroups}
        payeeNames={payeeNames}
        updateTransaction={updateTransaction}
        deleteTransaction={deleteTransaction}
        currency={budget.currency}
        showAccount
      />
    </div>
  );
}

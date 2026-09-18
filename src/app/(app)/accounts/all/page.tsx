import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { formatMilliunits } from "@/lib/money";
import { getTransactionEditOptions } from "@/lib/transactionOptions";
import { STARTING_BALANCE_PAYEE } from "@/lib/payees";
import {
  parseTransactionFilters,
  transactionFiltersWhere,
} from "@/lib/transactionFilters";
import { TransactionsTable } from "@/components/TransactionsTable";
import {
  updateTransaction,
  deleteTransaction,
  deleteTransactions,
  reconcileTransaction,
  unreconcileTransaction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function AllAccountsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const budget = await getCurrentBudget();

  // Starting-balance transactions (see createAccount) only make sense in
  // the context of the single account they seed — across "All Accounts"
  // they'd read as a stray, uncategorizable payee with no real activity
  // behind it, so they're excluded from both the filtered list and the
  // unfiltered total below.
  const baseWhere = {
    account: { budgetId: budget.id },
    NOT: { payee: { name: STARTING_BALANCE_PAYEE } },
  };

  // The four transactions-list filters (#19-#22) are pushed down into this
  // `where` clause instead of being applied client-side (#24), so only the
  // rows the current filters actually select are ever fetched.
  const filters = parseTransactionFilters(searchParams);

  const [
    accounts,
    transactions,
    totalCount,
    { categoryGroups, payeeNames, payeeLastCategory },
  ] = await Promise.all([
    prisma.account.findMany({
      where: { budgetId: budget.id, closed: false },
    }),
    prisma.transaction.findMany({
      where: { ...baseWhere, ...transactionFiltersWhere(filters) },
      orderBy: { date: "desc" },
      include: {
        payee: true,
        category: true,
        account: { select: { name: true } },
      },
    }),
    prisma.transaction.count({ where: baseWhere }),
    getTransactionEditOptions(budget.id),
  ]);

  const total = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-300">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="text-h2 text-neutral-800 sm:text-h1">All Accounts</h1>
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
        transactions={transactions}
        totalCount={totalCount}
        categoryGroups={categoryGroups}
        payeeNames={payeeNames}
        payeeLastCategory={payeeLastCategory}
        updateTransaction={updateTransaction}
        deleteTransaction={deleteTransaction}
        deleteTransactions={deleteTransactions}
        reconcileTransaction={reconcileTransaction}
        unreconcileTransaction={unreconcileTransaction}
        currency={budget.currency}
        showAccount
      />
    </div>
  );
}

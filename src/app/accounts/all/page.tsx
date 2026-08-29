import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { formatMilliunits } from "@/lib/money";
import { getTransactionEditOptions } from "@/lib/transactionOptions";
import {
  parseTransactionFilters,
  transactionFiltersWhere,
} from "@/lib/transactionFilters";
import { TransactionsTable } from "@/components/TransactionsTable";
import {
  updateTransaction,
  deleteTransaction,
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
    NOT: { payee: { name: "Starting Balance" } },
  };

  // The four transactions-list filters (#19-#22) are pushed down into this
  // `where` clause instead of being applied client-side (#24), so only the
  // rows the current filters actually select are ever fetched.
  const filters = parseTransactionFilters(searchParams);

  const [accounts, transactions, totalCount, { categoryGroups, payeeNames }] =
    await Promise.all([
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
          cleared: t.cleared,
          accountName: t.account.name,
        }))}
        totalCount={totalCount}
        categoryGroups={categoryGroups}
        payeeNames={payeeNames}
        updateTransaction={updateTransaction}
        deleteTransaction={deleteTransaction}
        unreconcileTransaction={unreconcileTransaction}
        currency={budget.currency}
        showAccount
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentBudget } from "@/lib/budget";
import { formatMilliunits } from "@/lib/money";
import { getTransactionEditOptions } from "@/lib/transactionOptions";
import {
  parseTransactionFilters,
  transactionFiltersWhere,
} from "@/lib/transactionFilters";
import { TransactionsTable } from "@/components/TransactionsTable";
import { ReconcileButton } from "@/components/ReconcileButton";
import { Icon } from "@/components/Icon";
import {
  updateTransaction,
  deleteTransaction,
  reconcileAccount,
  reconcileTransaction,
  unreconcileTransaction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const budget = await getCurrentBudget();

  const account = await prisma.account.findFirst({
    where: { id: params.id, budgetId: budget.id },
  });

  if (!account) {
    notFound();
  }

  // The four transactions-list filters (#19-#22) are pushed down into this
  // `where` clause instead of being applied client-side (#24), so only the
  // rows the current filters actually select are ever fetched.
  const filters = parseTransactionFilters(searchParams);

  const [transactions, totalCount, { categoryGroups, payeeNames }] =
    await Promise.all([
      prisma.transaction.findMany({
        where: { accountId: account.id, ...transactionFiltersWhere(filters) },
        orderBy: { date: "desc" },
        include: { payee: true, category: true },
      }),
      prisma.transaction.count({ where: { accountId: account.id } }),
      getTransactionEditOptions(budget.id),
    ]);

  return (
    <div className="space-y-300">
      <div>
        <Link
          href="/accounts"
          className="flex w-fit items-center gap-0.5 text-small font-medium text-brand-700 hover:underline"
        >
          <Icon name="arrow_back" /> Accounts
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div>
            <h1 className="text-h2 text-neutral-800 sm:text-h1">
              {account.name}
            </h1>
            <p className="text-body text-neutral-600">
              {account.type.replace(/_/g, " ")}
              {!account.onBudget && " · off budget"}
              {account.closed && " · closed"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={
                "text-h3 font-semibold sm:text-h2 " +
                (account.balance < 0 ? "text-danger" : "text-success")
              }
            >
              {formatMilliunits(account.balance, budget.currency)}
            </div>
            <ReconcileButton
              accountId={account.id}
              balance={account.balance}
              currency={budget.currency}
              reconcileAccount={reconcileAccount}
            />
          </div>
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
        }))}
        totalCount={totalCount}
        categoryGroups={categoryGroups}
        payeeNames={payeeNames}
        updateTransaction={updateTransaction}
        deleteTransaction={deleteTransaction}
        reconcileTransaction={reconcileTransaction}
        unreconcileTransaction={unreconcileTransaction}
        currency={budget.currency}
      />
    </div>
  );
}

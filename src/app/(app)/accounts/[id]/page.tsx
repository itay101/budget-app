import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentBudget } from "@/lib/budget";
import { getCurrentUser } from "@/lib/auth";
import { lookupAccountForPage } from "@/lib/accountLookup";
import { formatMilliunits } from "@/lib/money";
import { getTransactionEditOptions } from "@/lib/transactionOptions";
import { parseTransactionFilters } from "@/lib/transactionFilters";
import { loadTransactionsView } from "@/lib/transactionsView";
import { TransactionsTable } from "@/components/TransactionsTable";
import { ReconcileButton } from "@/components/ReconcileButton";
import { ReconciliationProvider } from "@/components/ReconciliationContext";
import { Icon } from "@/components/Icon";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  deleteTransactions,
  reconcileAccount,
  reconcileTransaction,
  unreconcileTransaction,
  checkImportDuplicates,
  importTransactions,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const [budget, user] = await Promise.all([getCurrentBudget(), getCurrentUser()]);

  // An account from another of this user's budgets means the current
  // budget changed under this URL (switch/create/delete, #204): land on
  // the current budget's accounts list instead of a 404.
  const lookup = await lookupAccountForPage(id, budget.id, user.id);
  if (lookup.kind === "otherBudget") {
    redirect("/accounts");
  }
  if (lookup.kind === "notFound") {
    notFound();
  }
  const { account } = lookup;

  // The four transactions-list filters (#19-#22) are pushed down into this
  // `where` clause instead of being applied client-side (#24), so only the
  // rows the current filters actually select are ever fetched.
  const filters = parseTransactionFilters(resolvedSearchParams);

  const [
    { transactions, totalCount },
    { categoryGroups, payeeNames, payeeLastCategory },
  ] = await Promise.all([
    loadTransactionsView({
      budgetId: budget.id,
      accountId: account.id,
      filters,
    }),
    getTransactionEditOptions(budget.id),
  ]);

  return (
    <ReconciliationProvider
      accountId={account.id}
      currency={budget.currency}
      reconcileAccount={reconcileAccount}
    >
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
              <ReconcileButton balance={account.balance} />
            </div>
          </div>
        </div>

        <TransactionsTable
          transactions={transactions}
          totalCount={totalCount}
          categoryGroups={categoryGroups}
          payeeNames={payeeNames}
          payeeLastCategory={payeeLastCategory}
          createTransaction={createTransaction}
          updateTransaction={updateTransaction}
          deleteTransaction={deleteTransaction}
          deleteTransactions={deleteTransactions}
          reconcileTransaction={reconcileTransaction}
          unreconcileTransaction={unreconcileTransaction}
          checkImportDuplicates={checkImportDuplicates}
          importTransactions={importTransactions}
          currency={budget.currency}
          accountBalance={account.balance}
          accountId={account.id}
          accountType={account.type}
        />
      </div>
    </ReconciliationProvider>
  );
}

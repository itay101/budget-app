import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBudget } from "@/lib/budget";
import { formatMilliunits } from "@/lib/money";
import { getTransactionEditOptions } from "@/lib/transactionOptions";
import { TransactionsTable } from "@/components/TransactionsTable";
import { updateTransaction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
}: {
  params: { id: string };
}) {
  const budget = await getOrCreateDefaultBudget();

  const account = await prisma.account.findFirst({
    where: { id: params.id, budgetId: budget.id },
  });

  if (!account) {
    notFound();
  }

  const [transactions, { categoryGroups, payeeNames }] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId: account.id },
      orderBy: { date: "desc" },
      include: { payee: true, category: true },
    }),
    getTransactionEditOptions(budget.id),
  ]);

  return (
    <div className="space-y-300">
      <div>
        <Link
          href="/accounts"
          className="text-small font-medium text-brand-700 hover:underline"
        >
          ← Accounts
        </Link>
        <div className="mt-1 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-h1 text-neutral-800">{account.name}</h1>
            <p className="text-body text-neutral-600">
              {account.type.replace(/_/g, " ")}
              {!account.onBudget && " · off budget"}
              {account.closed && " · closed"}
            </p>
          </div>
          <div
            className={
              "text-h2 font-semibold " +
              (account.balance < 0 ? "text-danger" : "text-neutral-800")
            }
          >
            {formatMilliunits(account.balance, budget.currency)}
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
        }))}
        categoryGroups={categoryGroups}
        payeeNames={payeeNames}
        updateTransaction={updateTransaction}
      />
    </div>
  );
}

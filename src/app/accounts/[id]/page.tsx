import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBudget } from "@/lib/budget";
import { formatMilliunits } from "@/lib/money";
import { TransactionsTable } from "@/components/TransactionsTable";
import { updateTransaction } from "./actions";

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

  const [transactions, categoryGroups, payees] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId: account.id },
      orderBy: { date: "desc" },
      include: { payee: true, category: true },
    }),
    prisma.categoryGroup.findMany({
      where: { budgetId: budget.id },
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
    prisma.payee.findMany({
      where: { budgetId: budget.id },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
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
        categoryGroups={categoryGroups.map((group) => ({
          id: group.id,
          name: group.name,
          categories: group.categories,
        }))}
        payeeNames={payees.map((p) => p.name)}
        updateTransaction={updateTransaction}
      />
    </div>
  );
}

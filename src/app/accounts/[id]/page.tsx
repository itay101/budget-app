import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBudget } from "@/lib/budget";
import { formatMilliunits } from "@/lib/money";

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

  const transactions = await prisma.transaction.findMany({
    where: { accountId: account.id },
    orderBy: { date: "desc" },
    include: { payee: true, category: true },
  });

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

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
        <div className="grid grid-cols-[100px_1fr_1fr_1fr_90px_120px] gap-2 border-b border-neutral-200 bg-neutral-100 px-200 py-2 text-small font-medium uppercase tracking-wide text-neutral-600">
          <div>Date</div>
          <div>Payee</div>
          <div>Category</div>
          <div>Memo</div>
          <div>Cleared</div>
          <div className="text-right">Amount</div>
        </div>

        {transactions.map((t) => (
          <div
            key={t.id}
            className="grid grid-cols-[100px_1fr_1fr_1fr_90px_120px] items-center gap-2 border-b border-neutral-100 px-200 py-2 text-body last:border-b-0"
          >
            <div className="text-neutral-600">
              {t.date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
            <div className="truncate text-neutral-800">
              {t.payee?.name ?? "—"}
            </div>
            <div className="truncate text-neutral-600">
              {t.category?.name ?? "—"}
            </div>
            <div className="truncate text-neutral-600">{t.memo ?? ""}</div>
            <div className="text-small uppercase text-neutral-600">
              {t.cleared === "UNCLEARED" ? "—" : t.cleared.toLowerCase()}
            </div>
            <div
              className={
                "text-right font-medium " +
                (t.amount < 0 ? "text-danger" : "text-success")
              }
            >
              {formatMilliunits(t.amount, budget.currency)}
            </div>
          </div>
        ))}

        {transactions.length === 0 && (
          <div className="px-200 py-300 text-body text-neutral-600">
            No transactions yet for this account.
          </div>
        )}
      </div>
    </div>
  );
}

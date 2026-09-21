import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STARTING_BALANCE_PAYEE } from "@/lib/payees";
import {
  transactionFiltersWhere,
  type TransactionFilters,
} from "@/lib/transactionFilters";
import type { TransactionInput } from "@/components/TransactionsTable";

/**
 * The query seam shared by accounts/[id]/page.tsx and accounts/all/page.tsx
 * (#97): one parameterized `transaction.findMany`/`count` pair instead of
 * each page independently building its own, which had already drifted once
 * (accounts/all excludes each account's starting-balance transaction,
 * accounts/[id] didn't). `accountId` picks which branch runs - present for
 * a single account, absent for the whole budget's "All Accounts" view.
 *
 * `totalCount` intentionally does NOT include `filters` - it's the
 * unfiltered count for the "Showing X of Y" summary, matching both pages'
 * prior behavior.
 */
export async function loadTransactionsView({
  budgetId,
  accountId,
  filters,
}: {
  budgetId: string;
  accountId?: string;
  filters: TransactionFilters;
}): Promise<{ transactions: TransactionInput[]; totalCount: number }> {
  const filterWhere = transactionFiltersWhere(filters);

  if (accountId) {
    const baseWhere: Prisma.TransactionWhereInput = { accountId };
    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where: { ...baseWhere, ...filterWhere },
        orderBy: { date: "desc" },
        include: { payee: true, category: true },
      }),
      prisma.transaction.count({ where: baseWhere }),
    ]);
    return { transactions, totalCount };
  }

  // Starting-balance transactions (see createAccount) only make sense in
  // the context of the single account they seed - across "All Accounts"
  // they'd read as a stray, uncategorizable payee with no real activity
  // behind it, so they're excluded from both the filtered list and the
  // unfiltered total below.
  const baseWhere: Prisma.TransactionWhereInput = {
    account: { budgetId },
    NOT: { payee: { name: STARTING_BALANCE_PAYEE } },
  };
  const [transactions, totalCount] = await Promise.all([
    prisma.transaction.findMany({
      where: { ...baseWhere, ...filterWhere },
      orderBy: { date: "desc" },
      include: {
        payee: true,
        category: true,
        account: { select: { name: true } },
      },
    }),
    prisma.transaction.count({ where: baseWhere }),
  ]);
  return { transactions, totalCount };
}

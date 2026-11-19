import { createTransferPair, deleteTransferRows, updateTransferPair } from "./transferWrite";
import type { AccountRef, DeletableTransaction, TransactionRef } from "./transferWrite";

jest.mock("@/lib/systemCategories", () => ({
  assertCategoryUsable: jest.fn(async () => undefined),
}));

type StoredAccount = AccountRef & { balance: number };
type StoredTransaction = {
  id: string;
  accountId: string;
  payeeId: string | null;
  categoryId: string | null;
  date: Date;
  amount: number;
  memo: string | null;
  transferTransactionId: string | null;
  payeeName: string | null;
};

function createFake() {
  let nextId = 0;
  const accounts = new Map<string, StoredAccount>();
  const transactions = new Map<string, StoredTransaction>();
  const audits: { action: string; entityId: string; changes: Record<string, [unknown, unknown]> }[] = [];

  function apply(row: Record<string, unknown>, data: Record<string, unknown>) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in value) {
        row[key] = (row[key] as number) + (value as { increment: number }).increment;
      } else {
        row[key] = value;
      }
    }
  }

  function decorate(row: StoredTransaction) {
    return {
      ...row,
      payee: row.payeeName ? { name: row.payeeName } : null,
      account: accounts.get(row.accountId),
    };
  }

  const tx = {
    account: {
      findUnique: async ({ where }: { where: { id: string } }) => accounts.get(where.id) ?? null,
      findMany: async ({ where }: { where: { budgetId?: string; name?: string; NOT?: { id: string } } }) =>
        [...accounts.values()].filter((account) => {
          if (where.budgetId && account.budgetId !== where.budgetId) return false;
          if (where.name && account.name !== where.name) return false;
          if (where.NOT?.id && account.id === where.NOT.id) return false;
          return true;
        }),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = accounts.get(where.id);
        if (!row) throw new Error(`missing account ${where.id}`);
        apply(row as unknown as Record<string, unknown>, data);
        return row;
      },
    },
    transaction: {
      create: async ({ data }: { data: Omit<StoredTransaction, "id" | "payeeName"> & { id?: string } }) => {
        const row: StoredTransaction = {
          id: data.id ?? `tx-${++nextId}`,
          accountId: data.accountId,
          payeeId: data.payeeId ?? null,
          categoryId: data.categoryId ?? null,
          date: data.date,
          amount: data.amount,
          memo: data.memo ?? null,
          transferTransactionId: data.transferTransactionId ?? null,
          payeeName: null,
        };
        transactions.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = transactions.get(where.id);
        if (!row) throw new Error(`missing transaction ${where.id}`);
        apply(row as unknown as Record<string, unknown>, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { OR: { id?: { in: string[] }; transferTransactionId?: { in: string[] } }[] };
        data: Record<string, unknown>;
      }) => {
        for (const row of transactions.values()) {
          const match = where.OR.some(
            (clause) =>
              clause.id?.in.includes(row.id) ||
              (row.transferTransactionId !== null &&
                clause.transferTransactionId?.in.includes(row.transferTransactionId)),
          );
          if (match) apply(row as unknown as Record<string, unknown>, data);
        }
      },
      delete: async ({ where }: { where: { id: string } }) => {
        transactions.delete(where.id);
      },
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        for (const id of where.id.in) transactions.delete(id);
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = transactions.get(where.id);
        return row ? decorate(row) : null;
      },
    },
    auditEntry: {
      create: async ({ data }: { data: (typeof audits)[number] }) => {
        audits.push(data);
      },
      createMany: async ({ data }: { data: (typeof audits)[number][] }) => {
        audits.push(...data);
      },
    },
  };

  function addAccount(account: AccountRef): StoredAccount {
    const row = { ...account, balance: 0 };
    accounts.set(account.id, row);
    return row;
  }

  function addTransaction(row: StoredTransaction) {
    transactions.set(row.id, row);
    return row;
  }

  return { tx, accounts, transactions, audits, addAccount, addTransaction };
}

const date = new Date("2026-11-19T00:00:00.000Z");

function account(id: string, name: string, onBudget: boolean): AccountRef {
  return { id, budgetId: "budget-1", name, onBudget, closed: false };
}

function asRef(row: StoredTransaction): TransactionRef {
  return { ...row };
}

function asDeletable(row: StoredTransaction): DeletableTransaction {
  return { ...row, budgetId: "budget-1" };
}

describe("transfer writes", () => {
  it("creates two linked rows with opposite amounts and one audit entry each", async () => {
    const fake = createFake();
    const checking = fake.addAccount(account("chk", "Checking", true));
    const savings = fake.addAccount(account("sav", "Savings", true));

    const created = await createTransferPair(fake.tx as never, {
      budgetId: "budget-1",
      actorId: "user-1",
      sourceAccount: checking,
      otherAccount: savings,
      existingSource: null,
      fields: { date, amount: -25_000, memo: "move" },
      enteredCategoryId: null,
      linkTransactionId: null,
    });

    const source = fake.transactions.get(created.sourceId)!;
    const other = fake.transactions.get(created.otherId)!;
    expect(source).toMatchObject({
      accountId: "chk",
      amount: -25_000,
      payeeId: null,
      categoryId: null,
      memo: "move",
      transferTransactionId: other.id,
    });
    expect(other).toMatchObject({
      accountId: "sav",
      amount: 25_000,
      payeeId: null,
      categoryId: null,
      memo: "move",
      transferTransactionId: source.id,
    });
    expect(checking.balance).toBe(-25_000);
    expect(savings.balance).toBe(25_000);
    const createdAudits = fake.audits.filter((entry) => entry.action === "created");
    expect(createdAudits).toHaveLength(2);
    expect(createdAudits.map((entry) => entry.changes.transferTransactionId?.[1]).sort()).toEqual(
      [other.id, source.id].sort(),
    );
  });

  it("puts a mixed transfer's category on the on-budget row only", async () => {
    const fake = createFake();
    const checking = fake.addAccount(account("chk", "Checking", true));
    const card = fake.addAccount(account("card", "Credit Card", false));

    const fromCash = await createTransferPair(fake.tx as never, {
      budgetId: "budget-1",
      actorId: "user-1",
      sourceAccount: checking,
      otherAccount: card,
      existingSource: null,
      fields: { date, amount: -10_000, memo: null },
      enteredCategoryId: "groceries",
      linkTransactionId: null,
    });
    expect(fake.transactions.get(fromCash.sourceId)?.categoryId).toBe("groceries");
    expect(fake.transactions.get(fromCash.otherId)?.categoryId).toBeNull();

    const fromCard = await createTransferPair(fake.tx as never, {
      budgetId: "budget-1",
      actorId: "user-1",
      sourceAccount: card,
      otherAccount: checking,
      existingSource: null,
      fields: { date, amount: 4_000, memo: null },
      enteredCategoryId: "groceries",
      linkTransactionId: null,
    });
    expect(fake.transactions.get(fromCard.sourceId)?.categoryId).toBeNull();
    expect(fake.transactions.get(fromCard.otherId)?.categoryId).toBe("groceries");
  });

  it("refuses a category on an on-budget to on-budget transfer before writing", async () => {
    const fake = createFake();
    const checking = fake.addAccount(account("chk", "Checking", true));
    const savings = fake.addAccount(account("sav", "Savings", true));

    await expect(
      createTransferPair(fake.tx as never, {
        budgetId: "budget-1",
        actorId: "user-1",
        sourceAccount: checking,
        otherAccount: savings,
        existingSource: null,
        fields: { date, amount: -10_000, memo: null },
        enteredCategoryId: "groceries",
        linkTransactionId: null,
      }),
    ).rejects.toThrow(/can't have a category/);
    expect(fake.transactions.size).toBe(0);
  });

  it("links a matching row instead of creating a second one", async () => {
    const fake = createFake();
    const checking = fake.addAccount(account("chk", "Checking", true));
    const savings = fake.addAccount(account("sav", "Savings", true));
    fake.addTransaction({
      id: "imported",
      accountId: "sav",
      payeeId: "payee-1",
      payeeName: "Online transfer",
      categoryId: null,
      date,
      amount: 25_000,
      memo: "bank",
      transferTransactionId: null,
    });

    const created = await createTransferPair(fake.tx as never, {
      budgetId: "budget-1",
      actorId: "user-1",
      sourceAccount: checking,
      otherAccount: savings,
      existingSource: null,
      fields: { date, amount: -25_000, memo: "move" },
      enteredCategoryId: null,
      linkTransactionId: "imported",
    });

    expect(created.otherId).toBe("imported");
    expect(fake.transactions.size).toBe(2);
    expect(fake.transactions.get("imported")).toMatchObject({
      transferTransactionId: created.sourceId,
      payeeId: null,
      memo: "move",
      amount: 25_000,
    });
    expect(checking.balance).toBe(-25_000);
    expect(savings.balance).toBe(0);
  });

  it("mirrors a date, amount, and memo edit onto the other row", async () => {
    const fake = createFake();
    const checking = fake.addAccount(account("chk", "Checking", true));
    const savings = fake.addAccount(account("sav", "Savings", true));
    const created = await createTransferPair(fake.tx as never, {
      budgetId: "budget-1",
      actorId: "user-1",
      sourceAccount: checking,
      otherAccount: savings,
      existingSource: null,
      fields: { date, amount: -25_000, memo: "move" },
      enteredCategoryId: null,
      linkTransactionId: null,
    });
    const source = fake.transactions.get(created.sourceId)!;
    const other = fake.transactions.get(created.otherId)!;
    const nextDate = new Date("2026-11-20T00:00:00.000Z");

    await updateTransferPair(fake.tx as never, {
      budgetId: "budget-1",
      actorId: "user-1",
      source: asRef(source),
      sourceAccount: checking,
      counterpart: asRef(other),
      counterpartAccount: savings,
      nextAccount: savings,
      fields: { date: nextDate, amount: -40_000, memo: "adjusted" },
      enteredCategoryId: null,
    });

    expect(fake.transactions.get(source.id)).toMatchObject({
      amount: -40_000,
      memo: "adjusted",
      date: nextDate,
    });
    expect(fake.transactions.get(other.id)).toMatchObject({
      amount: 40_000,
      memo: "adjusted",
      date: nextDate,
    });
    expect(checking.balance).toBe(-40_000);
    expect(savings.balance).toBe(40_000);
    expect(fake.audits.filter((entry) => entry.action === "updated")).toHaveLength(2);
  });

  it("deletes both sides and reverses both balances", async () => {
    const fake = createFake();
    const checking = fake.addAccount(account("chk", "Checking", true));
    const savings = fake.addAccount(account("sav", "Savings", true));
    const created = await createTransferPair(fake.tx as never, {
      budgetId: "budget-1",
      actorId: "user-1",
      sourceAccount: checking,
      otherAccount: savings,
      existingSource: null,
      fields: { date, amount: -25_000, memo: null },
      enteredCategoryId: null,
      linkTransactionId: null,
    });

    await deleteTransferRows(fake.tx as never, "user-1", [
      asDeletable(fake.transactions.get(created.sourceId)!),
      asDeletable(fake.transactions.get(created.otherId)!),
    ]);

    expect(fake.transactions.size).toBe(0);
    expect(checking.balance).toBe(0);
    expect(savings.balance).toBe(0);
    expect(fake.audits.filter((entry) => entry.action === "deleted")).toHaveLength(2);
  });
});

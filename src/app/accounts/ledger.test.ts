import { applyBalanceDelta, applyBalanceDeltas, findOrCreatePayee } from "./ledger";

// These exercise the ledger helpers against a mock Prisma transaction
// client rather than a real database - the point of #47 is that the
// balance-bookkeeping *rule* (increment by a signed delta, skip zero
// deltas, one update per account) lives in exactly one place, and that
// rule is what's pinned down here regardless of what actually reads/writes
// Postgres underneath it.
function mockTx() {
  return {
    account: { update: jest.fn() },
    payee: { findFirst: jest.fn(), create: jest.fn() },
  };
}

describe("applyBalanceDelta", () => {
  it("increments the account's balance by a positive delta", async () => {
    const tx = mockTx();
    await applyBalanceDelta(tx as never, "acc-1", 500);
    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { increment: 500 } },
    });
  });

  it("passes a negative delta straight through as a decrement-via-increment", async () => {
    const tx = mockTx();
    await applyBalanceDelta(tx as never, "acc-1", -1250);
    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { increment: -1250 } },
    });
  });

  it("is a no-op for a zero delta", async () => {
    const tx = mockTx();
    await applyBalanceDelta(tx as never, "acc-1", 0);
    expect(tx.account.update).not.toHaveBeenCalled();
  });
});

describe("applyBalanceDeltas", () => {
  it("applies one update per account in the map", async () => {
    const tx = mockTx();
    await applyBalanceDeltas(
      tx as never,
      new Map([
        ["acc-1", -300],
        ["acc-2", 750],
      ]),
    );
    expect(tx.account.update).toHaveBeenCalledTimes(2);
    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { increment: -300 } },
    });
    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: "acc-2" },
      data: { balance: { increment: 750 } },
    });
  });

  it("skips zero-delta accounts within the map", async () => {
    const tx = mockTx();
    await applyBalanceDeltas(tx as never, new Map([["acc-1", 0]]));
    expect(tx.account.update).not.toHaveBeenCalled();
  });
});

describe("findOrCreatePayee", () => {
  it("returns the existing payee's id without creating one", async () => {
    const tx = mockTx();
    tx.payee.findFirst.mockResolvedValue({ id: "payee-1" });

    const id = await findOrCreatePayee(tx as never, "budget-1", "Coffee Shop");

    expect(id).toBe("payee-1");
    expect(tx.payee.findFirst).toHaveBeenCalledWith({
      where: { budgetId: "budget-1", name: "Coffee Shop" },
    });
    expect(tx.payee.create).not.toHaveBeenCalled();
  });

  it("creates a payee when none matches yet", async () => {
    const tx = mockTx();
    tx.payee.findFirst.mockResolvedValue(null);
    tx.payee.create.mockResolvedValue({ id: "payee-2" });

    const id = await findOrCreatePayee(tx as never, "budget-1", "New Payee");

    expect(id).toBe("payee-2");
    expect(tx.payee.create).toHaveBeenCalledWith({
      data: { budgetId: "budget-1", name: "New Payee" },
    });
  });
});

import { auditedCreate, auditedDelete, auditedUpdate } from "./audit";

// Same mock-Tx pattern as ledger.test.ts: a hand-built stub client rather
// than a real Postgres transaction, since the rule under test (ordering
// apply→diff→recordAuditEntry, and what each shape diffs against) doesn't
// depend on anything Postgres actually does.
function mockTx() {
  return {
    auditEntry: { create: jest.fn(), createMany: jest.fn() },
  };
}

describe("auditedCreate", () => {
  it("applies, then records an audit entry diffed off apply's own result", async () => {
    const tx = mockTx();
    const apply = jest.fn(async () => ({ id: "cat-1", name: "Groceries" }));

    const result = await auditedCreate({
      tx: tx as never,
      budgetId: "budget-1",
      entityType: "CATEGORY",
      actorId: "user-1",
      apply,
      entityId: (r) => r.id,
      fields: (r) => ({ name: r.name }),
    });

    expect(result).toEqual({ id: "cat-1", name: "Groceries" });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(tx.auditEntry.create).toHaveBeenCalledWith({
      data: {
        budgetId: "budget-1",
        entityType: "CATEGORY",
        entityId: "cat-1",
        action: "created",
        actorId: "user-1",
        changes: { name: [null, "Groceries"] },
      },
    });
  });

  it("does not write an audit entry when apply throws", async () => {
    const tx = mockTx();
    const apply = jest.fn().mockRejectedValue(new Error("boom"));

    await expect(
      auditedCreate({
        tx: tx as never,
        budgetId: "budget-1",
        entityType: "CATEGORY",
        actorId: "user-1",
        apply,
        entityId: (r: { id: string }) => r.id,
        fields: () => ({}),
      }),
    ).rejects.toThrow("boom");

    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });

  it("honors an explicit action override", async () => {
    const tx = mockTx();
    const result = await auditedCreate({
      tx: tx as never,
      budgetId: "budget-1",
      entityType: "INVITE",
      actorId: "user-1",
      action: "invite sent",
      apply: async () => ({ id: "invite-1" }),
      entityId: (r) => r.id,
      fields: () => ({ status: "PENDING" }),
    });

    expect(result).toEqual({ id: "invite-1" });
    expect(tx.auditEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "invite sent" }),
    });
  });
});

describe("auditedUpdate", () => {
  it("applies, then diffs the supplied before/after", async () => {
    const tx = mockTx();
    const apply = jest.fn().mockResolvedValue({ id: "acc-1", name: "Checking" });

    const result = await auditedUpdate({
      tx: tx as never,
      budgetId: "budget-1",
      entityType: "ACCOUNT",
      entityId: "acc-1",
      actorId: "user-1",
      before: { name: "Old Name" },
      after: { name: "Checking" },
      apply,
    });

    expect(result).toEqual({ id: "acc-1", name: "Checking" });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(tx.auditEntry.create).toHaveBeenCalledWith({
      data: {
        budgetId: "budget-1",
        entityType: "ACCOUNT",
        entityId: "acc-1",
        action: "updated",
        actorId: "user-1",
        changes: { name: ["Old Name", "Checking"] },
      },
    });
  });

  it("skips the write when apply's own diff is a no-op", async () => {
    const tx = mockTx();
    await auditedUpdate({
      tx: tx as never,
      budgetId: "budget-1",
      entityType: "ACCOUNT",
      entityId: "acc-1",
      actorId: "user-1",
      before: { name: "Checking" },
      after: { name: "Checking" },
      apply: async () => ({ id: "acc-1" }),
    });

    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });

  it("does not write an audit entry when apply throws", async () => {
    const tx = mockTx();
    const apply = jest.fn().mockRejectedValue(new Error("boom"));

    await expect(
      auditedUpdate({
        tx: tx as never,
        budgetId: "budget-1",
        entityType: "ACCOUNT",
        entityId: "acc-1",
        actorId: "user-1",
        before: { name: "Old" },
        after: { name: "New" },
        apply,
      }),
    ).rejects.toThrow("boom");

    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });
});

describe("auditedDelete", () => {
  it("applies, then diffs before against an empty after", async () => {
    const tx = mockTx();
    const apply = jest.fn().mockResolvedValue(undefined);

    await auditedDelete({
      tx: tx as never,
      budgetId: "budget-1",
      entityType: "CATEGORY_GROUP",
      entityId: "group-1",
      actorId: "user-1",
      before: { name: "Bills", sortOrder: 2 },
      apply,
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(tx.auditEntry.create).toHaveBeenCalledWith({
      data: {
        budgetId: "budget-1",
        entityType: "CATEGORY_GROUP",
        entityId: "group-1",
        action: "deleted",
        actorId: "user-1",
        changes: { name: ["Bills", null], sortOrder: [2, null] },
      },
    });
  });

  it("does not write an audit entry when apply throws", async () => {
    const tx = mockTx();
    const apply = jest.fn().mockRejectedValue(new Error("boom"));

    await expect(
      auditedDelete({
        tx: tx as never,
        budgetId: "budget-1",
        entityType: "CATEGORY_GROUP",
        entityId: "group-1",
        actorId: "user-1",
        before: { name: "Bills" },
        apply,
      }),
    ).rejects.toThrow("boom");

    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });
});

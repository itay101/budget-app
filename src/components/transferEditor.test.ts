import { STARTING_BALANCE_PAYEE } from "@/lib/payees";
import {
  bulkDeleteMessage,
  categoryEditorState,
  linkOfferMessage,
  toRowData,
} from "@/lib/transferEditor";

describe("transfer editor helpers", () => {
  it("labels a linked row Transfer: <other account> and keeps an ordinary payee", () => {
    const transfer = toRowData({
      id: "t1",
      date: new Date("2026-11-19T00:00:00.000Z"),
      payee: null,
      categoryId: null,
      memo: null,
      amount: -25_000,
      cleared: "UNCLEARED",
      account: { id: "chk", onBudget: true },
      transferTransaction: {
        id: "t2",
        categoryId: null,
        cleared: "RECONCILED",
        account: { id: "sav", name: "Savings", onBudget: true },
      },
    });
    expect(transfer.payeeName).toBe("Transfer: Savings");
    expect(transfer.transferAccountId).toBe("sav");
    expect(transfer.counterpartCleared).toBe("RECONCILED");

    const ordinary = toRowData({
      id: "t3",
      date: new Date("2026-11-19T00:00:00.000Z"),
      payee: { name: STARTING_BALANCE_PAYEE },
      categoryId: "rta",
      memo: null,
      amount: 100,
      cleared: "CLEARED",
    });
    expect(ordinary.payeeName).toBe(STARTING_BALANCE_PAYEE);
    expect(ordinary.transferAccountId).toBe("");
  });

  it("disables the category on an on-budget to on-budget transfer and records a mixed one on the on-budget account", () => {
    const none = categoryEditorState({
      isStartingBalance: false,
      accountOnBudget: true,
      transfer: { id: "sav", name: "Savings", onBudget: true },
      existingTransfer: false,
      categoryGroups: [],
      counterpartCategoryId: null,
    });
    expect(none.disabled).toBe(true);
    expect(none.disabledLabel).toBe("No category");

    const otherRow = categoryEditorState({
      isStartingBalance: false,
      accountOnBudget: false,
      transfer: { id: "chk", name: "Checking", onBudget: true },
      existingTransfer: false,
      categoryGroups: [],
      counterpartCategoryId: null,
    });
    expect(otherRow.disabled).toBe(false);
    expect(otherRow.hint).toBe("This category is recorded on Checking.");
  });

  it("offers the closest matching row and names both sides in a bulk delete", () => {
    expect(linkOfferMessage("Savings", [])).toBeNull();
    expect(linkOfferMessage("Savings", [{ id: "a", date: "2026-11-18", amount: 15000, memo: "bank" }])).toContain(
      "2026-11-18",
    );
    expect(bulkDeleteMessage(2, true)).toContain("both sides");
    expect(bulkDeleteMessage(1, false)).toBe("Delete 1 transaction? This can't be undone.");
  });
});

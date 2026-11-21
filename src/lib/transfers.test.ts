import { STARTING_BALANCE_PAYEE } from "@/lib/payees";
import {
  TRANSFER_CATEGORY_MIXED,
  TRANSFER_CATEGORY_OFF_OFF,
  TRANSFER_CATEGORY_OFF_SIDE,
  TRANSFER_CATEGORY_ON_ON,
  TRANSFER_LINK_WINDOW_DAYS,
  categoriesForEditedRow,
  counterpartSharedFields,
  matchingTransferAccount,
  mirroredSharedPatch,
  onBudgetChangeError,
  resolveTransferCategories,
  selectLinkCandidates,
  transferAccountNameFromPayee,
  transferPayeeLabel,
} from "./transfers";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("transfer payee label", () => {
  it("reads the other account's name back out of Transfer: <name>", () => {
    expect(transferPayeeLabel("Savings")).toBe("Transfer: Savings");
    expect(transferAccountNameFromPayee("Transfer: Savings")).toBe("Savings");
    expect(transferAccountNameFromPayee("Transfer:  Savings")).toBe("Savings");
    expect(transferAccountNameFromPayee("Grocery Store")).toBeNull();
    expect(transferAccountNameFromPayee("Transfer:")).toBeNull();
  });

  it("keeps a closed counterpart when its name still matches, and refuses an ambiguous name", () => {
    const open = [
      { id: "sav", name: "Savings", onBudget: true },
      { id: "sav-2", name: "Savings", onBudget: true },
    ];
    const closed = { id: "old", name: "Old Checking", onBudget: true };
    expect(matchingTransferAccount("Transfer: Old Checking", open, "chk", closed)).toEqual(closed);
    expect(matchingTransferAccount("Transfer: Savings", open, "chk", null)).toBeNull();
    expect(matchingTransferAccount("Grocery Store", open, "chk", closed)).toBeNull();
  });
});

describe("transfer category rule", () => {
  it("gives an on-budget to on-budget transfer no category", () => {
    expect(resolveTransferCategories({ sourceOnBudget: true, otherOnBudget: true }, null)).toEqual({
      sourceCategoryId: null,
      otherCategoryId: null,
      error: null,
    });
  });

  it("refuses a category on an on-budget to on-budget transfer", () => {
    expect(resolveTransferCategories({ sourceOnBudget: true, otherOnBudget: true }, "groceries").error).toBe(
      TRANSFER_CATEGORY_ON_ON,
    );
  });

  it("gives an off-budget to off-budget transfer no category", () => {
    expect(resolveTransferCategories({ sourceOnBudget: false, otherOnBudget: false }, null)).toEqual({
      sourceCategoryId: null,
      otherCategoryId: null,
      error: null,
    });
    expect(resolveTransferCategories({ sourceOnBudget: false, otherOnBudget: false }, "groceries").error).toBe(
      TRANSFER_CATEGORY_OFF_OFF,
    );
  });

  it("requires a category on the on-budget row of a mixed transfer, and nowhere else", () => {
    expect(resolveTransferCategories({ sourceOnBudget: true, otherOnBudget: false }, null).error).toBe(
      TRANSFER_CATEGORY_MIXED,
    );
    expect(resolveTransferCategories({ sourceOnBudget: true, otherOnBudget: false }, "groceries")).toEqual({
      sourceCategoryId: "groceries",
      otherCategoryId: null,
      error: null,
    });
    expect(resolveTransferCategories({ sourceOnBudget: false, otherOnBudget: true }, "groceries")).toEqual({
      sourceCategoryId: null,
      otherCategoryId: "groceries",
      error: null,
    });
  });

  it("keeps an edited row's category only on the side the rule allows", () => {
    expect(
      categoriesForEditedRow({
        sourceOnBudget: true,
        otherOnBudget: false,
        sourceCategoryId: "groceries",
        otherCategoryId: null,
        enteredCategoryId: "rent",
      }),
    ).toEqual({ sourceCategoryId: "rent", otherCategoryId: null, error: null });

    expect(
      categoriesForEditedRow({
        sourceOnBudget: false,
        otherOnBudget: true,
        sourceCategoryId: null,
        otherCategoryId: "groceries",
        enteredCategoryId: null,
      }),
    ).toEqual({ sourceCategoryId: null, otherCategoryId: "groceries", error: null });

    expect(
      categoriesForEditedRow({
        sourceOnBudget: false,
        otherOnBudget: true,
        sourceCategoryId: null,
        otherCategoryId: "groceries",
        enteredCategoryId: "rent",
      }).error,
    ).toBe(TRANSFER_CATEGORY_OFF_SIDE);

    // Moving the other side onto an on-budget account clears both categories.
    expect(
      categoriesForEditedRow({
        sourceOnBudget: true,
        otherOnBudget: true,
        sourceCategoryId: "groceries",
        otherCategoryId: null,
        enteredCategoryId: null,
      }),
    ).toEqual({ sourceCategoryId: null, otherCategoryId: null, error: null });
  });
});

describe("mirrored transfer fields", () => {
  const date = day("2026-11-19");

  it("copies the date and memo and negates the amount", () => {
    expect(counterpartSharedFields({ date, amount: -25_000, memo: "move" })).toEqual({
      date,
      amount: 25_000,
      memo: "move",
    });
    expect(counterpartSharedFields({ date, amount: 0, memo: null })).toEqual({
      date,
      amount: 0,
      memo: null,
    });
  });

  it("mirrors only the shared fields present on the edit", () => {
    expect(mirroredSharedPatch({ amount: -18_500, memo: "rent" })).toEqual({
      amount: 18_500,
      memo: "rent",
    });
    expect(mirroredSharedPatch({ date })).toEqual({ date });
    expect(mirroredSharedPatch({})).toEqual({});
  });
});

describe("linking an existing row", () => {
  const date = day("2026-11-19");

  function row(overrides: Partial<{
    id: string;
    date: string;
    amount: number;
    transferTransactionId: string | null;
    payeeName: string | null;
  }>) {
    return {
      id: overrides.id ?? "row",
      date: day(overrides.date ?? "2026-11-19"),
      amount: overrides.amount ?? 25_000,
      transferTransactionId: overrides.transferTransactionId ?? null,
      payeeName: overrides.payeeName ?? null,
    };
  }

  it(`offers an unlinked opposite amount within ${TRANSFER_LINK_WINDOW_DAYS} days, closest first`, () => {
    const chosen = selectLinkCandidates(
      [
        row({ id: "far", date: "2026-11-15", amount: 25_000 }),
        row({ id: "near", date: "2026-11-18", amount: 25_000 }),
        row({ id: "same-sign", date: "2026-11-19", amount: -25_000 }),
        row({ id: "linked", date: "2026-11-19", amount: 25_000, transferTransactionId: "other" }),
        row({ id: "opening", date: "2026-11-19", amount: 25_000, payeeName: STARTING_BALANCE_PAYEE }),
        row({ id: "too-far", date: "2026-11-14", amount: 25_000 }),
      ],
      { amount: -25_000, date },
    );
    expect(chosen.map((candidate) => candidate.id)).toEqual(["near", "far"]);
  });
});

describe("on-budget lock", () => {
  it("refuses a change once the account has any transaction, including a starting balance", () => {
    expect(onBudgetChangeError(true, false, true)).toMatch(/can't be changed/);
    expect(onBudgetChangeError(false, false, true)).toBeNull();
    expect(onBudgetChangeError(true, true, true)).toBeNull();
  });
});

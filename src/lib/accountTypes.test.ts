import { ACCOUNT_TYPE_LOCKED_MESSAGE, ACCOUNT_TYPES, accountTypeChangeError, isDebtAccountType } from "./accountTypes";

describe("isDebtAccountType", () => {
  it("is true for Credit Card and Line of Credit", () => {
    expect(isDebtAccountType("CREDIT_CARD")).toBe(true);
    expect(isDebtAccountType("LINE_OF_CREDIT")).toBe(true);
  });

  it("is false for every other account type", () => {
    for (const type of ACCOUNT_TYPES) {
      if (type === "CREDIT_CARD" || type === "LINE_OF_CREDIT") continue;
      expect(isDebtAccountType(type)).toBe(false);
    }
  });
});

describe("accountTypeChangeError", () => {
  it("locks the type once the account has a transaction, and allows an unchanged type", () => {
    expect(accountTypeChangeError(true, "CHECKING", "CREDIT_CARD")).toBe(ACCOUNT_TYPE_LOCKED_MESSAGE);
    expect(accountTypeChangeError(true, "CREDIT_CARD", "CREDIT_CARD")).toBeNull();
    expect(accountTypeChangeError(false, "CHECKING", "CREDIT_CARD")).toBeNull();
  });
});

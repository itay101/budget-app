import { ACCOUNT_TYPES, isDebtAccountType } from "./accountTypes";

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

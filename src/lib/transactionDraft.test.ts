import {
  amountFromDraft,
  applyPayeeChange,
  draftAmountInput,
  Draft,
} from "./transactionDraft";

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    date: "2026-01-01",
    payeeName: "",
    categoryId: "",
    memo: "",
    inflow: "",
    outflow: "",
    ...overrides,
  };
}

describe("amountFromDraft", () => {
  it("returns 0 when both inflow and outflow are empty", () => {
    expect(amountFromDraft(draft())).toBe(0);
  });

  it("returns the positive milliunits amount when only inflow is set", () => {
    expect(amountFromDraft(draft({ inflow: "12.5" }))).toBe(12500);
  });

  it("returns the negative milliunits amount when only outflow is set", () => {
    expect(amountFromDraft(draft({ outflow: "12.5" }))).toBe(-12500);
  });

  it("prefers inflow when both are set", () => {
    expect(amountFromDraft(draft({ inflow: "10", outflow: "5" }))).toBe(10000);
  });
});

describe("draftAmountInput", () => {
  it("returns 0 when both inflow and outflow are empty", () => {
    expect(draftAmountInput(draft())).toBe(0);
  });

  it("returns the raw positive dollar amount when only inflow is set - not milliunits", () => {
    // updateTransaction/createTransaction milliunits-convert this field
    // themselves - if this returned milliunits like amountFromDraft does,
    // the server would double-convert it and inflate every saved amount
    // 1000x.
    expect(draftAmountInput(draft({ inflow: "12.5" }))).toBe(12.5);
  });

  it("returns the raw negative dollar amount when only outflow is set", () => {
    expect(draftAmountInput(draft({ outflow: "12.5" }))).toBe(-12.5);
  });

  it("prefers inflow when both are set", () => {
    expect(draftAmountInput(draft({ inflow: "10", outflow: "5" }))).toBe(10);
  });
});

describe("applyPayeeChange", () => {
  it("fills the payee's remembered default category when the draft has none", () => {
    const result = applyPayeeChange(draft(), "Costco", { Costco: "cat-1" });
    expect(result).toEqual(draft({ payeeName: "Costco", categoryId: "cat-1" }));
  });

  it("leaves an existing category untouched", () => {
    const result = applyPayeeChange(
      draft({ categoryId: "cat-existing" }),
      "Costco",
      {
        Costco: "cat-1",
      },
    );
    expect(result.categoryId).toBe("cat-existing");
  });

  it("is a no-op on category when the payee has no remembered category", () => {
    const result = applyPayeeChange(draft(), "New Payee", {
      Costco: "cat-1",
    });
    expect(result).toEqual(draft({ payeeName: "New Payee", categoryId: "" }));
  });
});

import { ceilDiv } from "./money";

describe("ceilDiv", () => {
  it("divides exactly when there's no remainder", () => {
    expect(ceilDiv(1200, 4)).toBe(300);
  });

  it("rounds a remainder up", () => {
    expect(ceilDiv(1000, 3)).toBe(334);
    expect(ceilDiv(1, 1000)).toBe(1);
  });

  it("rounds toward zero for negative amounts, which is still up", () => {
    expect(ceilDiv(-1000, 3)).toBe(-333);
  });

  it("stays exact up to the largest safe integer", () => {
    expect(ceilDiv(Number.MAX_SAFE_INTEGER, 2)).toBe(2 ** 52);
    expect(ceilDiv(3_000_000_000_000_001, 3)).toBe(1_000_000_000_000_001);
  });

  it("rejects a fractional amount or a non-positive divisor", () => {
    expect(() => ceilDiv(1.5, 2)).toThrow(RangeError);
    expect(() => ceilDiv(10, 0)).toThrow(RangeError);
  });
});

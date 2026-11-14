import { buildImportPreview, parseSplitAmount, type ColumnMapping } from "./importPreview";

const single: ColumnMapping = {
  date: 0,
  payee: 1,
  memo: 2,
  amountMode: "single",
  amount: 3,
  inflow: null,
  outflow: null,
};

describe("parseSplitAmount", () => {
  it("takes the inflow side when it has a value", () => {
    expect(parseSplitAmount("12.50", "")).toBe(12.5);
  });

  it("makes the outflow side negative", () => {
    expect(parseSplitAmount("", "40")).toBe(-40);
  });

  it("returns null when both sides are blank or a side doesn't parse", () => {
    expect(parseSplitAmount(" ", "")).toBeNull();
    expect(parseSplitAmount("abc", "")).toBeNull();
  });
});

describe("buildImportPreview", () => {
  it("parses dates, payee, memo and a signed amount", () => {
    const rows = buildImportPreview({
      dataRows: [["21/08/2026", "Cafe", "latte", "-4.50"]],
      mapping: single,
      dateOrder: "auto",
      flipSign: false,
    });
    expect(rows).toEqual([
      {
        rowIndex: 1,
        date: "2026-08-21",
        payeeName: "Cafe",
        memo: "latte",
        amount: -4.5,
        error: null,
        duplicate: false,
        included: true,
      },
    ]);
  });

  it("flips single-column amounts for debt accounts but not split ones", () => {
    const flipped = buildImportPreview({
      dataRows: [["2026-08-01", "Shop", "", "20"]],
      mapping: single,
      dateOrder: "auto",
      flipSign: true,
    });
    expect(flipped[0].amount).toBe(-20);

    const split = buildImportPreview({
      dataRows: [["2026-08-01", "Refund", "30", ""]],
      mapping: { ...single, memo: null, amountMode: "split", amount: null, inflow: 2, outflow: 3 },
      dateOrder: "auto",
      flipSign: true,
    });
    expect(split[0].amount).toBe(30);
  });

  it("marks rows whose date or amount doesn't parse and leaves them out", () => {
    const rows = buildImportPreview({
      dataRows: [
        ["not a date", "A", "", "1"],
        ["2026-08-01", "B", "", "n/a"],
      ],
      mapping: single,
      dateOrder: "auto",
      flipSign: false,
    });
    expect(rows.map((r) => [r.error, r.included])).toEqual([
      ["Invalid or missing date", false],
      ["Invalid or missing amount", false],
    ]);
  });

  it("uses an explicit date order over auto-detection", () => {
    const rows = buildImportPreview({
      dataRows: [["03/08/2026", "A", "", "1"]],
      mapping: single,
      dateOrder: "DMY",
      flipSign: false,
    });
    expect(rows[0].date).toBe("2026-08-03");
  });
});

import { parseCSV } from "./csv";

describe("parseCSV", () => {
  it("parses a simple comma-separated table", () => {
    expect(parseCSV("Date,Payee,Amount\n2026-08-21,Coffee Shop,-4.50")).toEqual([
      ["Date", "Payee", "Amount"],
      ["2026-08-21", "Coffee Shop", "-4.50"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCSV('Date,Payee\n2026-08-21,"Smith, John"')).toEqual([
      ["Date", "Payee"],
      ["2026-08-21", "Smith, John"],
    ]);
  });

  it("handles quoted fields containing embedded newlines", () => {
    expect(parseCSV('Date,Memo\n2026-08-21,"line one\nline two"')).toEqual([
      ["Date", "Memo"],
      ["2026-08-21", "line one\nline two"],
    ]);
  });

  it('unescapes a doubled "" inside a quoted field into a single quote', () => {
    expect(parseCSV('Memo\n"She said ""hi"""')).toEqual([
      ["Memo"],
      ['She said "hi"'],
    ]);
  });

  it("normalizes \\r\\n and bare \\r line endings", () => {
    expect(parseCSV("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseCSV("a,b\rc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("parses a file with no trailing newline", () => {
    expect(parseCSV("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("drops fully blank rows (trailing newline, blank separator lines)", () => {
    expect(parseCSV("a,b\n\nc,d\n\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCSV("")).toEqual([]);
  });
});

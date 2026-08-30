import {
  cleanCell,
  detectDateOrder,
  guessColumn,
  guessHeaderRowIndex,
  parseImportAmount,
  parseImportDate,
  HEADER_HINTS,
} from "./importParsing";

// Unicode codepoints built with String.fromCodePoint rather than pasted
// literally or as \u escapes in a regex/string - both of those are exactly
// the kind of thing that's impossible to eyeball-verify (that's the whole
// bug class this file exists to guard against). Named so a failing test
// reads as "the right-to-left mark case broke", not a mystery character.
const ZWSP = String.fromCodePoint(0x200b); // zero-width space
const RLM = String.fromCodePoint(0x200f); // right-to-left mark
const LRM = String.fromCodePoint(0x200e); // left-to-right mark
const RLE = String.fromCodePoint(0x202b); // right-to-left embedding
const PDF = String.fromCodePoint(0x202c); // pop directional formatting
const BOM = String.fromCodePoint(0xfeff); // zero-width no-break space / BOM

const EN_DASH = String.fromCodePoint(0x2013);
const EM_DASH = String.fromCodePoint(0x2014);
const FIGURE_DASH = String.fromCodePoint(0x2012);
const MINUS_SIGN = String.fromCodePoint(0x2212);
const MAQAF = String.fromCodePoint(0x05be); // Hebrew punctuation maqaf
const FULLWIDTH_HYPHEN = String.fromCodePoint(0xff0d);

describe("cleanCell", () => {
  it("leaves plain ASCII text untouched apart from trimming", () => {
    expect(cleanCell("  09-08-2026  ")).toBe("09-08-2026");
    expect(cleanCell("Grocery Store")).toBe("Grocery Store");
  });

  it("strips invisible bidi/zero-width characters wherever they appear", () => {
    expect(cleanCell(`${RLM}09-08-2026${RLM}`)).toBe("09-08-2026");
    expect(cleanCell(`09${ZWSP}-08-2026`)).toBe("09-08-2026");
    expect(cleanCell(`${LRM}${RLE}09-08-2026${PDF}`)).toBe("09-08-2026");
    expect(cleanCell(`${BOM}09-08-2026`)).toBe("09-08-2026");
  });

  it("normalizes Unicode dash look-alikes to a plain ASCII hyphen", () => {
    expect(cleanCell(`09${EN_DASH}08${EN_DASH}2026`)).toBe("09-08-2026");
    expect(cleanCell(`09${EM_DASH}08${EM_DASH}2026`)).toBe("09-08-2026");
    expect(cleanCell(`09${FIGURE_DASH}08${FIGURE_DASH}2026`)).toBe(
      "09-08-2026",
    );
    expect(cleanCell(`09${MINUS_SIGN}08${MINUS_SIGN}2026`)).toBe(
      "09-08-2026",
    );
    expect(cleanCell(`09${MAQAF}08${MAQAF}2026`)).toBe("09-08-2026");
    expect(cleanCell(`09${FULLWIDTH_HYPHEN}08${FULLWIDTH_HYPHEN}2026`)).toBe(
      "09-08-2026",
    );
  });

  it("handles invisible characters and dash look-alikes together", () => {
    // The realistic case: an RTL export embedding both at once around a
    // date that visually looks exactly like "09-08-2026" either way.
    expect(cleanCell(`${RLM}09${MAQAF}08${MAQAF}2026${RLM}`)).toBe(
      "09-08-2026",
    );
  });

  it("returns an empty string for blank/whitespace-only/invisible-only input", () => {
    expect(cleanCell("")).toBe("");
    expect(cleanCell("   ")).toBe("");
    expect(cleanCell(RLM + ZWSP)).toBe("");
  });
});

describe("parseImportDate", () => {
  it("parses ISO dates regardless of order argument", () => {
    expect(parseImportDate("2026-08-21")).toBe("2026-08-21");
    expect(parseImportDate("2026-08-21", "DMY")).toBe("2026-08-21");
  });

  it("parses an ISO date with a trailing time component", () => {
    expect(parseImportDate("2026-08-21T14:32:00")).toBe("2026-08-21");
    expect(parseImportDate("2026-08-21 14:32:00")).toBe("2026-08-21");
  });

  it("parses slash dates under both orders", () => {
    expect(parseImportDate("8/21/2026", "MDY")).toBe("2026-08-21");
    expect(parseImportDate("21/8/2026", "DMY")).toBe("2026-08-21");
  });

  it("parses hyphen and dot dates the same way as slash dates", () => {
    expect(parseImportDate("21-8-2026", "DMY")).toBe("2026-08-21");
    expect(parseImportDate("8-21-2026", "MDY")).toBe("2026-08-21");
    expect(parseImportDate("21.8.2026", "DMY")).toBe("2026-08-21");
  });

  it("expands a 2-digit year to 20xx", () => {
    expect(parseImportDate("21/8/26", "DMY")).toBe("2026-08-21");
  });

  it("pads single-digit day/month components", () => {
    expect(parseImportDate("9-8-2026", "DMY")).toBe("2026-08-09");
  });

  // This is the exact bug from the reported credit-card import: a date
  // that displays as "09-08-2026" in the UI but actually carries an
  // invisible RTL mark and/or a look-alike dash instead of a plain "-".
  it("parses a date carrying invisible bidi marks around/inside it", () => {
    expect(parseImportDate(`${RLM}09-08-2026${RLM}`, "DMY")).toBe(
      "2026-08-09",
    );
    expect(parseImportDate(`09${ZWSP}-08-2026`, "DMY")).toBe("2026-08-09");
  });

  it("parses a date using a Unicode dash look-alike instead of ASCII hyphen", () => {
    expect(parseImportDate(`09${EN_DASH}08${EN_DASH}2026`, "DMY")).toBe(
      "2026-08-09",
    );
    expect(parseImportDate(`09${MAQAF}08${MAQAF}2026`, "DMY")).toBe(
      "2026-08-09",
    );
  });

  it("parses a date combining both invisible marks and a dash look-alike", () => {
    expect(
      parseImportDate(`${RLM}09${MAQAF}08${MAQAF}2026${RLM}`, "DMY"),
    ).toBe("2026-08-09");
  });

  it("rejects an out-of-range month/day rather than silently wrapping", () => {
    expect(parseImportDate("2026-13-01")).toBeNull(); // month 13
    expect(parseImportDate("2026-02-30")).toBeNull(); // Feb 30
    expect(parseImportDate("32/1/2026", "DMY")).toBeNull(); // day 32
  });

  it("returns null for blank, garbage, or unrecognized formats", () => {
    expect(parseImportDate("")).toBeNull();
    expect(parseImportDate("   ")).toBeNull();
    expect(parseImportDate("not a date")).toBeNull();
    expect(parseImportDate("August 21, 2026")).toBeNull();
  });
});

describe("detectDateOrder", () => {
  it("detects DMY when any value's first component exceeds 12", () => {
    expect(detectDateOrder(["01/09/2026", "13/09/2026", "22/09/2026"])).toBe(
      "DMY",
    );
  });

  it("detects MDY when any value's second component exceeds 12", () => {
    expect(detectDateOrder(["09/01/2026", "09/13/2026"])).toBe("MDY");
  });

  it("falls back to MDY when every value is ambiguous (day and month both <=12)", () => {
    expect(detectDateOrder(["01/02/2026", "03/04/2026"])).toBe("MDY");
  });

  it("works through invisible marks and dash look-alikes, not just plain text", () => {
    expect(
      detectDateOrder([`${RLM}01${MAQAF}09${MAQAF}2026${RLM}`, "13-09-2026"]),
    ).toBe("DMY");
  });

  it("ignores ISO and unparsable values when scanning for a delimited date", () => {
    expect(detectDateOrder(["2026-08-21", "not a date", "22/09/2026"])).toBe(
      "DMY",
    );
  });

  it("defaults to MDY for an empty column", () => {
    expect(detectDateOrder([])).toBe("MDY");
  });
});

describe("parseImportAmount", () => {
  it("parses a plain positive or negative amount", () => {
    expect(parseImportAmount("128.7")).toBe(128.7);
    expect(parseImportAmount("-84.99")).toBe(-84.99);
  });

  it("strips a currency symbol and thousands separators", () => {
    expect(parseImportAmount("$1,234.56")).toBe(1234.56);
    expect(parseImportAmount("₪128.70")).toBe(128.7);
  });

  it("treats a parenthesized amount as negative", () => {
    expect(parseImportAmount("(12.34)")).toBe(-12.34);
  });

  it("cleans invisible marks and dash-like minus signs before parsing", () => {
    expect(parseImportAmount(`${RLM}128.7${RLM}`)).toBe(128.7);
    expect(parseImportAmount(`${MINUS_SIGN}84.99`)).toBe(-84.99);
  });

  it("returns null for blank or unparsable input", () => {
    expect(parseImportAmount("")).toBeNull();
    expect(parseImportAmount("   ")).toBeNull();
    expect(parseImportAmount("-")).toBeNull();
    expect(parseImportAmount("N/A")).toBeNull();
  });
});

describe("guessHeaderRowIndex", () => {
  it("returns 0 for a file with no preamble", () => {
    const table = [
      ["Date", "Payee", "Amount"],
      ["2026-08-21", "Coffee Shop", "-4.50"],
    ];
    expect(guessHeaderRowIndex(table)).toBe(0);
  });

  it("skips metadata preamble rows to find the real header row", () => {
    const table = [
      ["(1) All users"],
      ["5619-Super Pay-back"],
      ["09/2026"],
      ["Date", "Payee", "Category", "Amount"],
      ["09-08-2026", "Coffee Shop", "Food", "-350.00"],
      ["10-08-2026", "Gas Station", "Auto", "-200.00"],
    ];
    expect(guessHeaderRowIndex(table)).toBe(3);
  });

  it("works for non-English (Hebrew) headers, since it doesn't match header text", () => {
    const table = [
      ["(1) כל המשתמשים"],
      ["5619-Super Pay-back"],
      ["09/2026"],
      ["תאריך עסקה", "שם בית העסק", "סכום חיוב"],
      ["09-08-2026", "גט קומפי", "128.7"],
    ];
    expect(guessHeaderRowIndex(table)).toBe(3);
  });

  it("falls back to row 0 when nothing in the scan window looks like data", () => {
    const table = [
      ["Some", "Header"],
      ["not", "a date"],
      ["still", "nothing"],
    ];
    expect(guessHeaderRowIndex(table)).toBe(0);
  });
});

describe("guessColumn", () => {
  it("matches a header case-insensitively against the hint list", () => {
    expect(guessColumn(["Date", "Description", "Amount"], HEADER_HINTS.date)).toBe(
      0,
    );
    expect(
      guessColumn(["Date", "Description", "Amount"], HEADER_HINTS.payee),
    ).toBe(1);
    expect(
      guessColumn(["Date", "Description", "AMOUNT"], HEADER_HINTS.amount),
    ).toBe(2);
  });

  it("returns null when no header matches any hint", () => {
    expect(
      guessColumn(["תאריך", "שם"], HEADER_HINTS.date),
    ).toBeNull();
  });
});

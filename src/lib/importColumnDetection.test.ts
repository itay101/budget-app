import {
  MAX_SAMPLE_CELL_LENGTH,
  MAX_SAMPLE_ROWS,
  SAMPLE_DATA_ROWS,
  buildDetectionPrompt,
  buildDetectionSample,
  DEFAULT_DETECTION_MODEL,
  canSkipMapping,
  detectionModel,
  detectionToMapping,
  isColumnDetectionEnabled,
  maskCell,
  normalizeDetection,
  parseDetectionRequest,
  type ColumnDetection,
} from "./importColumnDetection";

const table = [
  ["Account: ACME Bank 12-345", "", "", ""],
  ["Date", "Description", "Note", "Amount"],
  ["21/08/2026", "Coffee Place", "latte", "-4.50"],
  ["22/08/2026", "Salary Inc", "", "1,234.56"],
  ["23/08/2026", "Grocer", "weekly", "-87.10"],
];

const confident = (column: number | null) => ({ column, confidence: 0.95 });

const goodDetection: ColumnDetection = {
  headerRowIndex: 1,
  amountMode: "single",
  amountModeConfidence: 0.95,
  dateOrder: "DMY",
  date: confident(0),
  payee: confident(1),
  memo: confident(2),
  amount: confident(3),
  inflow: { column: null, confidence: 0 },
  outflow: { column: null, confidence: 0 },
};

describe("maskCell", () => {
  it("keeps the shape of amounts, dates and text", () => {
    expect(maskCell("-1,234.56")).toBe("-9,999.99");
    expect(maskCell("12/03/2026")).toBe("99/99/9999");
    expect(maskCell("ACME Coffee #12")).toBe("XXXX Xxxxxx #99");
    expect(maskCell("₪ 45.00")).toBe("₪ 99.99");
  });

  it("masks scripts without case as lower-case letters", () => {
    expect(maskCell("קפה 3")).toBe("xxx 9");
  });

  it("is idempotent", () => {
    const once = maskCell("Coffee -4.50");
    expect(maskCell(once)).toBe(once);
  });
});

describe("buildDetectionSample", () => {
  it("keeps the guessed header row readable and masks everything else", () => {
    const sample = buildDetectionSample(table);
    expect(sample[1]).toEqual(["Date", "Description", "Note", "Amount"]);
    expect(sample[0][0]).toBe("Xxxxxxx: XXXX Xxxx 99-999");
    expect(sample[2]).toEqual(["99/99/9999", "Xxxxxx Xxxxx", "xxxxx", "-9.99"]);
  });

  it("masks the first row too when the file has no header row", () => {
    const sample = buildDetectionSample([
      ["08/21/2026", "John Smith Rent", "-1500.00"],
      ["08/22/2026", "Grocer", "-9.10"],
    ]);
    expect(sample[0]).toEqual(["99/99/9999", "Xxxx Xxxxx Xxxx", "-9999.99"]);
  });

  it("masks every row when nothing in the file looks like a transaction", () => {
    const sample = buildDetectionSample([["Account holder: Jane Doe, acct 12345678"], ["x"]]);
    expect(sample[0]).toEqual(["Xxxxxxx xxxxxx: Xxxx Xxx, xxxx 99999999"]);
  });

  it("sends at most SAMPLE_DATA_ROWS data rows, MAX_SAMPLE_ROWS in all", () => {
    const long = [["Date", "Amount"], ...Array.from({ length: 40 }, () => ["2026-08-01", "1.00"])];
    expect(buildDetectionSample(long)).toHaveLength(1 + SAMPLE_DATA_ROWS);

    const preamble = [
      ...Array.from({ length: 10 }, () => ["info"]),
      ["Date", "Amount"],
      ...Array.from({ length: 10 }, () => ["2026-08-01", "1.00"]),
    ];
    expect(buildDetectionSample(preamble).length).toBeLessThanOrEqual(MAX_SAMPLE_ROWS);
  });

  it("truncates long cells", () => {
    const sample = buildDetectionSample([["Date", "x".repeat(200)], ["2026-08-01", "1"]]);
    expect(sample[0][1]).toHaveLength(MAX_SAMPLE_CELL_LENGTH);
  });
});

describe("buildDetectionPrompt", () => {
  it("sends the rows as JSON", () => {
    expect(buildDetectionPrompt([["a"], ["9"]])).toContain('[["a"],["9"]]');
  });
});

describe("detectionModel", () => {
  it("defaults when IMPORT_DETECTION_MODEL is unset or blank", () => {
    expect(detectionModel({})).toBe(DEFAULT_DETECTION_MODEL);
    expect(detectionModel({ IMPORT_DETECTION_MODEL: "  " })).toBe(DEFAULT_DETECTION_MODEL);
  });

  it("uses IMPORT_DETECTION_MODEL when set", () => {
    expect(detectionModel({ IMPORT_DETECTION_MODEL: " google/gemini-2.5-flash-lite " })).toBe(
      "google/gemini-2.5-flash-lite",
    );
  });
});

describe("isColumnDetectionEnabled", () => {
  it("needs a Gateway key or a Vercel deployment", () => {
    expect(isColumnDetectionEnabled({})).toBe(false);
    expect(isColumnDetectionEnabled({ AI_GATEWAY_API_KEY: "key" })).toBe(true);
    expect(isColumnDetectionEnabled({ VERCEL: "1" })).toBe(true);
  });
});

describe("parseDetectionRequest", () => {
  const sample = buildDetectionSample(table);
  const env = { AI_GATEWAY_API_KEY: "key" };

  it("is off without a Gateway credential", () => {
    expect(parseDetectionRequest({ accountId: "a1", sample }, {})).toBeNull();
  });

  it("is on with an API key, or on Vercel (OIDC)", () => {
    expect(parseDetectionRequest({ accountId: "a1", sample }, env)).toEqual({ accountId: "a1", sample });
    expect(parseDetectionRequest({ accountId: "a1", sample }, { VERCEL: "1" })).not.toBeNull();
  });

  it("rejects malformed or oversized samples", () => {
    expect(parseDetectionRequest({ accountId: "", sample }, env)).toBeNull();
    expect(parseDetectionRequest({ accountId: "a1", sample: "rows" }, env)).toBeNull();
    expect(parseDetectionRequest({ accountId: "a1", sample: [["a"]] }, env)).toBeNull();
    expect(parseDetectionRequest({ accountId: "a1", sample: [["a"], [1]] }, env)).toBeNull();
    const tooMany = Array.from({ length: MAX_SAMPLE_ROWS + 1 }, () => ["a"]);
    expect(parseDetectionRequest({ accountId: "a1", sample: tooMany }, env)).toBeNull();
    const tooLong = [["a"], ["x".repeat(MAX_SAMPLE_CELL_LENGTH + 1)]];
    expect(parseDetectionRequest({ accountId: "a1", sample: tooLong }, env)).toBeNull();
  });
});

describe("normalizeDetection", () => {
  it("accepts a valid answer", () => {
    expect(normalizeDetection(goodDetection, table)).toEqual(goodDetection);
  });

  it("rejects answers it can't use at all", () => {
    expect(normalizeDetection(null, table)).toBeNull();
    expect(normalizeDetection({ ...goodDetection, headerRowIndex: 4 }, table)).toBeNull();
    expect(normalizeDetection({ ...goodDetection, headerRowIndex: 1.5 }, table)).toBeNull();
    expect(normalizeDetection({ ...goodDetection, amountMode: "both" }, table)).toBeNull();
  });

  it("drops out-of-range columns and clamps confidence", () => {
    const d = normalizeDetection(
      { ...goodDetection, payee: { column: 9, confidence: 1 }, date: { column: 0, confidence: 3 } },
      table,
    );
    expect(d?.payee).toEqual({ column: null, confidence: 0 });
    expect(d?.date).toEqual({ column: 0, confidence: 1 });
  });

  it("clears the columns of the amount mode not chosen", () => {
    const d = normalizeDetection({ ...goodDetection, inflow: confident(3) }, table);
    expect(d?.inflow).toEqual({ column: null, confidence: 0 });
  });

  it("treats an unknown date order as auto", () => {
    expect(normalizeDetection({ ...goodDetection, dateOrder: "YMD" }, table)?.dateOrder).toBeNull();
  });
});

describe("detectionToMapping", () => {
  it("maps detected columns to the modal's mapping", () => {
    expect(detectionToMapping(goodDetection)).toEqual({
      date: 0,
      payee: 1,
      memo: 2,
      amountMode: "single",
      amount: 3,
      inflow: null,
      outflow: null,
    });
  });
});

describe("canSkipMapping", () => {
  it("skips for a confident answer that parses", () => {
    expect(canSkipMapping(goodDetection, table)).toBe(true);
  });

  it("doesn't skip when a required field is below 0.8", () => {
    expect(canSkipMapping({ ...goodDetection, payee: { column: 1, confidence: 0.79 } }, table)).toBe(false);
    expect(canSkipMapping({ ...goodDetection, amountModeConfidence: 0.5 }, table)).toBe(false);
  });

  it("doesn't need the optional memo to be confident", () => {
    expect(canSkipMapping({ ...goodDetection, memo: { column: null, confidence: 0 } }, table)).toBe(true);
  });

  it("doesn't skip when a required field is missing", () => {
    expect(canSkipMapping({ ...goodDetection, payee: { column: null, confidence: 0.9 } }, table)).toBe(false);
  });

  it("doesn't skip when two fields share a column", () => {
    expect(canSkipMapping({ ...goodDetection, memo: confident(1) }, table)).toBe(false);
  });

  it("doesn't skip when the sample rows don't parse with the mapping", () => {
    // Payee and Amount swapped: confident, distinct, but "Coffee Place" isn't an amount.
    expect(canSkipMapping({ ...goodDetection, payee: confident(3), amount: confident(1) }, table)).toBe(
      false,
    );
    // The wrong date order makes 21/08/2026 an invalid month.
    expect(canSkipMapping({ ...goodDetection, dateOrder: "MDY" }, table)).toBe(false);
  });

  it("needs both Inflow and Outflow in split mode", () => {
    const split = [
      ["Date", "Payee", "Credit", "Debit"],
      ["2026-08-01", "Salary", "100", ""],
      ["2026-08-02", "Shop", "", "20"],
    ];
    const d: ColumnDetection = {
      ...goodDetection,
      headerRowIndex: 0,
      amountMode: "split",
      memo: { column: null, confidence: 0 },
      amount: { column: null, confidence: 0 },
      inflow: confident(2),
      outflow: confident(3),
    };
    expect(canSkipMapping(d, split)).toBe(true);
    expect(canSkipMapping({ ...d, outflow: { column: null, confidence: 0 } }, split)).toBe(false);
  });

  it("doesn't skip a file with no data rows after the header", () => {
    expect(canSkipMapping({ ...goodDetection, headerRowIndex: 4 }, table)).toBe(false);
  });
});

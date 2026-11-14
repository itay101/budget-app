/**
 * AI column detection for File Import (#197, docs/adr/0014). The model call
 * itself lives in the detectImportColumns server action; everything here is
 * pure so it can be unit-tested without a model:
 *
 * - buildDetectionSample: the few rows that leave the browser, masked so no
 *   real payee or amount is sent (maskCell).
 * - parseDetectionRequest: the server-side checks on that sample, and the
 *   on/off switch (no credential, no AI).
 * - normalizeDetection: the model's answer, checked against the real table.
 * - canSkipMapping: whether that answer is trusted enough to go straight to
 *   the preview step.
 */
import {
  cleanCell,
  guessHeaderRowIndex,
  looksLikeDataRow,
  type DateOrder,
} from "@/lib/importParsing";
import { buildImportPreview, type AmountMode, type ColumnMapping } from "@/lib/importPreview";

/** Data rows sent after the guessed header row. */
export const SAMPLE_DATA_ROWS = 5;
/** Hard caps on what one request may carry, enforced on both sides. */
export const MAX_SAMPLE_ROWS = 12;
const MAX_SAMPLE_COLUMNS = 30;
export const MAX_SAMPLE_CELL_LENGTH = 60;
/** Every required field must score at least this to skip the mapping step. */
const SKIP_CONFIDENCE = 0.8;
/** How long the server waits for the model before giving up. */
export const DETECTION_TIMEOUT_MS = 5000;

/**
 * Hides a cell's content but keeps its shape: digits become 9, letters
 * become X (upper case) or x (lower case, and scripts without case such as
 * Hebrew); separators, signs, currency symbols and length stay. So
 * "-1,234.56" -> "-9,999.99" and "ACME Coffee #12" -> "XXXX Xxxxxx #99":
 * the model can still tell a date from an amount from text, but no real
 * payee or amount leaves the app. Idempotent.
 */
export function maskCell(value: string): string {
  // One pass, so the X this writes isn't then re-read as a letter.
  return value.replace(/\p{Nd}|\p{L}/gu, (c) =>
    /\p{Nd}/u.test(c) ? "9" : /\p{Lu}/u.test(c) ? "X" : "x",
  );
}

function trimCell(value: string): string {
  return cleanCell(value).slice(0, MAX_SAMPLE_CELL_LENGTH);
}

/**
 * The rows sent to the model: everything up to the heuristically guessed
 * header row (preamble lines are masked, since they often hold an account
 * name or number), the guessed header row as plain text (column names are
 * what the model needs most, and aren't personal), and the first
 * SAMPLE_DATA_ROWS data rows masked. If the guess is wrong the real header
 * is masked too, and the model works from cell shapes alone.
 */
export function buildDetectionSample(table: string[][]): string[][] {
  const headerGuess = guessHeaderRowIndex(table);
  // guessHeaderRowIndex falls back to row 0 when nothing looks like data,
  // and row 0 is itself a transaction in a file with no header row. Only
  // a guess that is followed by a data row and isn't one itself is sent
  // as plain text, so no real payee or amount can slip through that way.
  const plainRow =
    looksLikeDataRow(table[headerGuess + 1] ?? []) && !looksLikeDataRow(table[headerGuess])
      ? headerGuess
      : -1;
  const rowCount = Math.min(table.length, headerGuess + 1 + SAMPLE_DATA_ROWS, MAX_SAMPLE_ROWS);
  return table.slice(0, rowCount).map((row, i) =>
    row
      .slice(0, MAX_SAMPLE_COLUMNS)
      .map((cell) => (i === plainRow ? trimCell(cell) : maskCell(trimCell(cell)))),
  );
}

/**
 * Validates a detection request on the server (isColumnDetectionEnabled
 * is also read by the account page, so the modal doesn't even try when it
 * is off). Returns null (feature off,
 * nothing is sent) when no AI Gateway credential is available or the
 * request is malformed. On Vercel the Gateway authenticates with the
 * deployment's OIDC token, so `VERCEL` alone turns it on; elsewhere it needs
 * `AI_GATEWAY_API_KEY`. Local dev and e2e normally have neither.
 */
export function isColumnDetectionEnabled(env: Record<string, string | undefined>): boolean {
  return Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL);
}

export function parseDetectionRequest(
  input: { accountId: unknown; sample: unknown },
  env: Record<string, string | undefined>,
): { accountId: string; sample: string[][] } | null {
  if (!isColumnDetectionEnabled(env)) return null;
  const { accountId, sample } = input;
  if (typeof accountId !== "string" || !accountId) return null;
  if (!Array.isArray(sample) || sample.length < 2 || sample.length > MAX_SAMPLE_ROWS) return null;
  const rows: string[][] = [];
  for (const row of sample) {
    if (!Array.isArray(row) || row.length > MAX_SAMPLE_COLUMNS) return null;
    if (!row.every((c) => typeof c === "string" && c.length <= MAX_SAMPLE_CELL_LENGTH)) return null;
    rows.push(row as string[]);
  }
  return { accountId, sample: rows };
}

export const DETECTION_INSTRUCTIONS = `You map the columns of a bank statement export to transaction fields.
You get the first rows of the file as JSON: an array of rows, each an array of cells, indexed from 0.
Personal data is masked but keeps its shape: digits are 9, letters are X or x. So "99/99/9999" is a date and "-9,999.99" is an amount.
One row is the column header row; it is usually not masked. Rows above it are account information and must be ignored.
Return:
- headerRowIndex: the index of the header row.
- date, payee, memo, amount, inflow, outflow: the 0-based column index of each field in the header row, or null if the file has none, each with a confidence from 0 to 1.
  payee is who the money went to or came from (often "Description"). memo is an extra note or reference, if any.
- amountMode: "single" when one signed column holds the amount, "split" when there are separate inflow (credit) and outflow (debit) columns. In "single" mode inflow and outflow are null; in "split" mode amount is null.
- dateOrder: "DMY" if dates are day first, "MDY" if month first, null if it can't be told from the rows or dates are ISO (yyyy-mm-dd).
Headers can be in any language. Never give two fields the same column.`;

export function buildDetectionPrompt(sample: string[][]): string {
  return `Rows:\n${JSON.stringify(sample)}`;
}

export type DetectedField = { column: number | null; confidence: number };

const FIELDS = ["date", "payee", "memo", "amount", "inflow", "outflow"] as const;
type Field = (typeof FIELDS)[number];

/** What the model returns (the server action's schema has the same shape). */
export type RawColumnDetection = {
  headerRowIndex: number;
  amountMode: AmountMode;
  amountModeConfidence: number;
  dateOrder: DateOrder | null;
} & Record<Field, DetectedField>;

export type ColumnDetection = RawColumnDetection;

function clampConfidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * Checks the model's answer against the actual file: a header row that
 * exists, column indices inside that row (anything else becomes "no
 * column" with zero confidence), confidences clamped to 0..1, and the
 * column for the amount mode not chosen dropped. Returns null when the
 * answer isn't usable at all, so the caller falls back to the heuristics.
 */
export function normalizeDetection(raw: unknown, table: string[][]): ColumnDetection | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const headerRowIndex = r.headerRowIndex;
  if (
    typeof headerRowIndex !== "number" ||
    !Number.isInteger(headerRowIndex) ||
    headerRowIndex < 0 ||
    headerRowIndex >= table.length - 1
  ) {
    return null;
  }
  if (r.amountMode !== "single" && r.amountMode !== "split") return null;
  const amountMode: AmountMode = r.amountMode;
  const width = table[headerRowIndex].length;

  const field = (name: Field): DetectedField => {
    const f = r[name] as { column?: unknown; confidence?: unknown } | null | undefined;
    const column = f?.column;
    if (typeof column !== "number" || !Number.isInteger(column) || column < 0 || column >= width) {
      return { column: null, confidence: 0 };
    }
    return { column, confidence: clampConfidence(f?.confidence) };
  };
  const none: DetectedField = { column: null, confidence: 0 };

  return {
    headerRowIndex,
    amountMode,
    amountModeConfidence: clampConfidence(r.amountModeConfidence),
    dateOrder: r.dateOrder === "DMY" || r.dateOrder === "MDY" ? r.dateOrder : null,
    date: field("date"),
    payee: field("payee"),
    memo: field("memo"),
    amount: amountMode === "single" ? field("amount") : none,
    inflow: amountMode === "split" ? field("inflow") : none,
    outflow: amountMode === "split" ? field("outflow") : none,
  };
}

export function detectionToMapping(d: ColumnDetection): ColumnMapping {
  return {
    date: d.date.column,
    payee: d.payee.column,
    memo: d.memo.column,
    amountMode: d.amountMode,
    amount: d.amount.column,
    inflow: d.inflow.column,
    outflow: d.outflow.column,
  };
}

/**
 * Whether the detected mapping is trusted enough to skip the mapping step
 * and open the preview directly. All of:
 * - Date, Payee and the amount column(s) for the mode (Amount, or both
 *   Inflow and Outflow) are present, and they and the mode itself score at
 *   least SKIP_CONFIDENCE;
 * - no two fields share a column;
 * - our own parser reads the date and amount of every sampled data row
 *   with this mapping - a deterministic check that doesn't rely on the
 *   model's own confidence.
 * Otherwise the mapping dialog opens pre-filled with the detection.
 */
export function canSkipMapping(d: ColumnDetection, table: string[][]): boolean {
  const required: DetectedField[] = [
    d.date,
    d.payee,
    ...(d.amountMode === "single" ? [d.amount] : [d.inflow, d.outflow]),
  ];
  if (d.amountModeConfidence < SKIP_CONFIDENCE) return false;
  if (required.some((f) => f.column === null || f.confidence < SKIP_CONFIDENCE)) return false;

  const used = FIELDS.map((name) => d[name].column).filter((c): c is number => c !== null);
  if (new Set(used).size !== used.length) return false;

  const sampleRows = table
    .slice(d.headerRowIndex + 1, d.headerRowIndex + 1 + SAMPLE_DATA_ROWS)
    .filter((row) => row.some((cell) => cleanCell(cell) !== ""));
  if (sampleRows.length === 0) return false;
  const preview = buildImportPreview({
    dataRows: sampleRows,
    mapping: detectionToMapping(d),
    dateOrder: d.dateOrder ?? "auto",
    flipSign: false,
  });
  return preview.every((row) => row.error === null);
}

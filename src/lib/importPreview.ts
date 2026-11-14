/**
 * Turns a File Import table plus a column mapping into preview rows (#35).
 * Pulled out of ImportTransactionsModal so the same rules decide both what
 * the preview step shows and whether an AI-detected mapping parses cleanly
 * enough to skip the mapping step (see @/lib/importColumnDetection, #197).
 */
import {
  cleanCell,
  detectDateOrder,
  parseImportAmount,
  parseImportDate,
  type DateOrder,
} from "@/lib/importParsing";

export type AmountMode = "single" | "split";

/** Column indices into the header row, or null for "no column". */
export type ColumnMapping = {
  date: number | null;
  payee: number | null;
  memo: number | null;
  amountMode: AmountMode;
  amount: number | null;
  inflow: number | null;
  outflow: number | null;
};

export type PreviewRow = {
  rowIndex: number; // 1-based position in the data rows, for the error list
  date: string; // ISO "yyyy-mm-dd", "" when it didn't parse
  payeeName: string;
  memo: string;
  amount: number; // dollars, sign included; 0 when it didn't parse
  error: string | null;
  duplicate: boolean;
  included: boolean;
};

/**
 * Combines an Inflow/Outflow column pair into one signed amount, same
 * "whichever side has a value wins" rule the manual entry row uses. Blank
 * cells on both sides means the row has no amount at all (an error);
 * blank on one side just means that side is zero.
 */
export function parseSplitAmount(inflowRaw: string, outflowRaw: string): number | null {
  if (!inflowRaw.trim() && !outflowRaw.trim()) return null;
  const inflow = inflowRaw.trim() ? parseImportAmount(inflowRaw) : 0;
  const outflow = outflowRaw.trim() ? parseImportAmount(outflowRaw) : 0;
  if (inflow === null || outflow === null) return null;
  return inflow !== 0 ? Math.abs(inflow) : -Math.abs(outflow);
}

/** "auto" resolves against the whole mapped Date column (see detectDateOrder). */
function resolveDateOrder(
  dataRows: string[][],
  mapping: ColumnMapping,
  dateOrder: "auto" | DateOrder,
): DateOrder {
  if (dateOrder !== "auto") return dateOrder;
  return detectDateOrder(
    dataRows.map((cells) => (mapping.date !== null ? (cells[mapping.date] ?? "") : "")),
  );
}

function rowAmount(
  cell: (index: number | null) => string,
  mapping: ColumnMapping,
  flipSign: boolean,
): number | null {
  if (mapping.amountMode === "split") {
    return parseSplitAmount(cell(mapping.inflow), cell(mapping.outflow));
  }
  const amount = parseImportAmount(cell(mapping.amount));
  return amount !== null && flipSign ? -amount : amount;
}

/**
 * Parses every data row with `mapping`. `flipSign` negates single-column
 * amounts for debt-style accounts (see ImportTransactionsModal); separate
 * Inflow/Outflow columns already carry explicit direction, so flipping
 * there would turn a refund into a charge instead of fixing anything.
 */
export function buildImportPreview({
  dataRows,
  mapping,
  dateOrder,
  flipSign,
}: {
  dataRows: string[][];
  mapping: ColumnMapping;
  dateOrder: "auto" | DateOrder;
  flipSign: boolean;
}): PreviewRow[] {
  const resolvedDateOrder = resolveDateOrder(dataRows, mapping, dateOrder);

  return dataRows.map((cells, i) => {
    const rawCell = (index: number | null) => (index !== null ? (cells[index] ?? "") : "");
    const cell = (index: number | null) => cleanCell(rawCell(index));

    const rawDate = rawCell(mapping.date);
    const date = parseImportDate(cell(mapping.date), resolvedDateOrder);
    const amount = rowAmount(cell, mapping, flipSign);

    let error: string | null = null;
    if (!date) {
      error = "Invalid or missing date";
      // A date that fails to parse despite looking fine on screen is
      // exactly the failure mode an invisible character or a Unicode
      // look-alike produces (see cleanCell) - neither shows up in a
      // screenshot, so logging the exact codepoints here means that class
      // of bug never again has to be diagnosed by guessing from one. Only
      // logs in the browser, and only when there's something to see: a
      // genuinely blank cell isn't a mystery.
      if (typeof window !== "undefined" && rawDate) {
        console.warn(`[File Import] row ${i + 1}: Date column didn't parse`, {
          raw: rawDate,
          rawCodePoints: Array.from(
            rawDate,
            (c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0"),
          ),
          cleaned: cell(mapping.date),
          order: resolvedDateOrder,
        });
      }
    } else if (amount === null) error = "Invalid or missing amount";

    return {
      rowIndex: i + 1,
      date: date ?? "",
      payeeName: cell(mapping.payee),
      memo: cell(mapping.memo),
      amount: amount ?? 0,
      error,
      duplicate: false,
      included: error === null,
    };
  });
}

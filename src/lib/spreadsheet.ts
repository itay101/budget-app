import { parseCSV } from "@/lib/csv";

/**
 * File Import (#35): whether `file` looks like an Excel workbook (.xlsx)
 * rather than a CSV. Legacy binary .xls isn't supported - the only
 * npm-published parser for that format (SheetJS's `xlsx`) ships with
 * unpatched high-severity vulnerabilities, so a bank export still in that
 * format needs to be re-saved as .xlsx or CSV first.
 */
export function isXlsxFile(file: File): boolean {
  return (
    /\.xlsx$/i.test(file.name) ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

/**
 * Whether `file` looks like a legacy binary .xls workbook. The <input
 * accept> filter on the file-select step steers the OS file dialog away
 * from these, but that's advisory only - it doesn't apply to drag-and-drop,
 * and some OS pickers let a user override it (e.g. "All Files"). Without
 * this check, a .xls slipped past it would fall through to the CSV branch
 * below and get read as UTF-8 text: .xls is a binary OLE2 format, so that
 * produces garbled "rows" of decoded binary noise ahead of any real
 * transaction data instead of a clean error.
 */
export function isLegacyXlsFile(file: File): boolean {
  return /\.xls$/i.test(file.name) || file.type === "application/vnd.ms-excel";
}

/**
 * Reads a File Import upload into the header-row + data-rows shape every
 * downstream step (column mapping, preview) works with - `string[][]`,
 * same as parseCSV's output - regardless of whether it came in as CSV or
 * an Excel workbook. Throws with a user-facing message for a legacy .xls
 * upload rather than attempting to parse it.
 */
export async function readImportFile(file: File): Promise<string[][]> {
  if (isLegacyXlsFile(file)) {
    throw new Error(
      "Legacy .xls files aren't supported - re-save as .xlsx or CSV first.",
    );
  }
  if (isXlsxFile(file)) {
    return readXlsxTable(file);
  }
  return parseCSV(await file.text());
}

async function readXlsxTable(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  // Dynamically imported - exceljs is only needed for .xlsx uploads, so a
  // CSV-only import never pays for its (much larger) bundle.
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  // Read every row out to the sheet's full column count (not just each
  // row's own last populated cell) so every row's array lines up with the
  // header row's column indices, same as parseCSV's rows do.
  const columnCount = worksheet.columnCount;
  const rows: string[][] = [];
  worksheet.eachRow((row) => {
    const cells: string[] = [];
    for (let i = 1; i <= columnCount; i++) {
      cells.push(cellText(row.getCell(i).value));
    }
    if (cells.some((c) => c.trim() !== "")) rows.push(cells);
  });
  return rows;
}

// ExcelJS represents a cell's value as a plain primitive for ordinary
// cells, or one of a few object shapes for rich text / formula results /
// hyperlinks - this pulls the plain display string out of any of them, the
// same string[][] shape parseImportDate/parseImportAmount already expect.
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if ("result" in obj) return cellText(obj.result);
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((part) =>
          typeof (part as { text?: unknown }).text === "string"
            ? (part as { text: string }).text
            : "",
        )
        .join("");
    }
    return "";
  }
  return String(value);
}

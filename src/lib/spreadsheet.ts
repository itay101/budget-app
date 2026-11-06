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
  const buffer = await unprefixXlsxParts(await file.arrayBuffer());
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

/**
 * #194: some bank exports (e.g. Cal's credit card statement, written by
 * .NET's System.IO.Packaging / Open XML SDK) put every element of a part
 * under a namespace prefix - `<x:workbook xmlns:x="...">`, `<x:sheets>`,
 * `<ap:Properties>` - instead of declaring it as the default namespace.
 * That's valid OOXML and Excel opens it fine, but ExcelJS matches on bare
 * tag names, so it never recognises the workbook and load() throws
 * "Cannot read properties of undefined (reading 'sheets')".
 *
 * This rewrites any XML part whose root element is prefixed so that
 * prefix's namespace becomes the default and its element tags lose the
 * prefix. The prefixed declaration is kept alongside, so any attribute
 * still using the prefix stays bound. Files that don't need it (every
 * export ExcelJS already reads) are returned untouched, without a re-zip.
 */
async function unprefixXlsxParts(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/\.(xml|rels)$/i.test(entry.name)) continue;
    const xml = await entry.async("string");
    const rewritten = unprefixRootNamespace(xml);
    if (rewritten !== xml) {
      zip.file(entry.name, rewritten);
      changed = true;
    }
  }
  return changed ? zip.generateAsync({ type: "arraybuffer" }) : buffer;
}

/**
 * The string-level rewrite behind unprefixXlsxParts, for one XML part:
 * `<x:a xmlns:x="NS"><x:b/></x:a>` becomes
 * `<a xmlns="NS" xmlns:x="NS"><b/></a>`. Leaves the part unchanged if its
 * root isn't prefixed, or already declares a default namespace (stripping
 * the prefix then would move elements into the wrong namespace).
 */
export function unprefixRootNamespace(xml: string): string {
  return unprefixRoot(xml, UNPREFIXED_NAMESPACES);
}

// Namespaces whose parts ExcelJS reads by bare element names. Deliberately
// not every namespace: ExcelJS's docProps/core.xml reader matches on the
// conventional `cp:`/`dc:` prefixes, so stripping those would break the
// ordinary files it already reads.
const UNPREFIXED_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
  "http://schemas.openxmlformats.org/package/2006/relationships",
  "http://schemas.openxmlformats.org/package/2006/content-types",
]);

function unprefixRoot(xml: string, namespaces: Set<string>): string {
  // The first tag that isn't a declaration/PI/comment is the root element.
  const root = xml.match(/<(?:([A-Za-z_][\w.-]*):)?[A-Za-z_][\w.-]*(?=[\s/>])[^>]*>/);
  if (!root || !root[1] || /\sxmlns\s*=/.test(root[0])) return xml;
  const prefix = root[1];
  const decl = new RegExp(`\\sxmlns:${prefix}\\s*=\\s*("[^"]*"|'[^']*')`);
  const ns = root[0].match(decl);
  if (!ns || !namespaces.has(ns[1].slice(1, -1))) return xml;

  const newRoot = root[0].replace(decl, ` xmlns=${ns[1]}$&`);
  const body = xml.slice(0, root.index) + newRoot + xml.slice(root.index! + root[0].length);
  return body.replace(new RegExp(`<(/?)${prefix}:`, "g"), "<$1");
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

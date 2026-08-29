/**
 * Minimal RFC4180-ish CSV parser used by File Import (#35): handles quoted
 * fields (including embedded commas/newlines) and `""` as an escaped quote.
 * Good enough for the bank/CSV exports File Import targets — not a
 * general-purpose CSV library, since the project doesn't otherwise depend
 * on one.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings so \r\n and a bare \r behave like \n.
  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Flush a final field/row for files that don't end with a trailing newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully blank rows (e.g. a trailing newline, or blank lines some
  // exports leave between sections).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

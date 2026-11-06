import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readImportFile, unprefixRootNamespace } from "@/lib/spreadsheet";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

async function buildXlsx(rows: (string | number)[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  rows.forEach((row) => sheet.addRow(row));
  const out = await workbook.xlsx.writeBuffer();
  return new Uint8Array(out as ArrayBuffer).buffer;
}

// Rewrites an ExcelJS-written workbook into the shape .NET's
// System.IO.Packaging produces (#194): every element in a part whose root
// is in a given default namespace gets an explicit prefix instead.
async function prefixParts(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/\.xml$/.test(entry.name)) continue;
    const xml = await entry.async("string");
    const prefix = entry.name === "docProps/app.xml" ? "ap" : "x";
    const rootNs = xml.match(/<[A-Za-z][^\s>?!]*[^>]*\sxmlns="([^"]*)"/);
    if (!rootNs) continue;
    zip.file(
      entry.name,
      xml
        .replace(/<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])/g, "<$1" + prefix + ":$2")
        .replace(` xmlns="${rootNs[1]}"`, ` xmlns:${prefix}="${rootNs[1]}"`),
    );
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

function xlsxFile(buffer: ArrayBuffer): File {
  return new File([buffer], "statement.xlsx", { type: XLSX_TYPE });
}

describe("unprefixRootNamespace", () => {
  it("moves a prefixed root's namespace to the default and strips element prefixes", () => {
    const xml = `<?xml version="1.0"?><x:workbook xmlns:r="R" xmlns:x="${MAIN_NS}"><x:sheets><x:sheet name="a" r:id="rId2" /></x:sheets></x:workbook>`;
    expect(unprefixRootNamespace(xml)).toBe(
      `<?xml version="1.0"?><workbook xmlns:r="R" xmlns="${MAIN_NS}" xmlns:x="${MAIN_NS}"><sheets><sheet name="a" r:id="rId2" /></sheets></workbook>`,
    );
  });

  it("leaves a part with an unprefixed root alone, even if children are prefixed", () => {
    const xml = `<coreProperties xmlns:dcterms="D" xmlns="C"><dcterms:created>2026</dcterms:created></coreProperties>`;
    expect(unprefixRootNamespace(xml)).toBe(xml);
  });

  it("leaves a prefixed root alone when it already declares a default namespace", () => {
    const xml = `<x:a xmlns="OTHER" xmlns:x="${MAIN_NS}"><b /></x:a>`;
    expect(unprefixRootNamespace(xml)).toBe(xml);
  });

  it("leaves namespaces ExcelJS reads by prefix (e.g. core properties' cp:) alone", () => {
    const xml = `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><cp:keywords /></cp:coreProperties>`;
    expect(unprefixRootNamespace(xml)).toBe(xml);
  });
});

describe("readImportFile (.xlsx)", () => {
  const rows = [
    ["Date", "Payee", "Amount"],
    ["2026-11-01", "Supermarket", 120.5],
    ["2026-11-02", "Fuel", 300],
  ];
  const expected = [
    ["Date", "Payee", "Amount"],
    ["2026-11-01", "Supermarket", "120.5"],
    ["2026-11-02", "Fuel", "300"],
  ];

  it("reads an ordinary workbook", async () => {
    await expect(readImportFile(xlsxFile(await buildXlsx(rows)))).resolves.toEqual(expected);
  });

  it("reads a workbook whose parts use namespace-prefixed elements (Cal export, #194)", async () => {
    const prefixed = await prefixParts(await buildXlsx(rows));

    // Sanity check the fixture reproduces the bug: plain ExcelJS can't load it.
    await expect(new ExcelJS.Workbook().xlsx.load(prefixed)).rejects.toThrow();

    await expect(readImportFile(xlsxFile(prefixed))).resolves.toEqual(expected);
  });
});

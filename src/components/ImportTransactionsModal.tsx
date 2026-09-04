"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { readImportFile } from "@/lib/spreadsheet";
import {
  cleanCell,
  detectDateOrder,
  guessColumn,
  guessHeaderRowIndex,
  HEADER_HINTS,
  parseImportAmount,
  parseImportDate,
  type DateOrder,
} from "@/lib/importParsing";
import { formatMilliunits, numberToMilliunits } from "@/lib/money";
import { Icon } from "@/components/Icon";
import type { ImportRow } from "@/app/accounts/actions";
import type { AccountType } from "@/lib/accountTypes";

type Step = "select" | "mapping" | "preview";
type AmountMode = "single" | "split";

type Mapping = {
  date: number | null;
  payee: number | null;
  memo: number | null;
  amountMode: AmountMode;
  amount: number | null;
  inflow: number | null;
  outflow: number | null;
};

type PreviewRow = ImportRow & {
  rowIndex: number; // 1-based position in the file, for the error list
  error: string | null;
  duplicate: boolean;
  included: boolean;
};

// <select> sentinel for "no column chosen" - "" is already the header-index
// string for column 0, so it can't double as "none".
const NONE = "__none__";

function parseSingleAmount(raw: string): number | null {
  return parseImportAmount(raw);
}

// Combines an Inflow/Outflow column pair into one signed amount, same
// "whichever side has a value wins" rule the manual entry row uses. Blank
// cells on both sides means the row has no amount at all (an error);
// blank on one side just means that side is zero.
function parseSplitAmount(inflowRaw: string, outflowRaw: string): number | null {
  if (!inflowRaw.trim() && !outflowRaw.trim()) return null;
  const inflow = inflowRaw.trim() ? parseImportAmount(inflowRaw) : 0;
  const outflow = outflowRaw.trim() ? parseImportAmount(outflowRaw) : 0;
  if (inflow === null || outflow === null) return null;
  return inflow !== 0 ? Math.abs(inflow) : -Math.abs(outflow);
}

/**
 * File Import (#35): a three-step modal (choose file → map columns →
 * preview/confirm) opened from the "File Import" button next to Add
 * Transaction. Accepts CSV and Excel (.xlsx) for v1 - the issue notes
 * OFX/QFX/QIF as a possible follow-up, but those don't need the column
 * mapping step this modal is built around. Legacy binary .xls isn't
 * supported (see @/lib/spreadsheet) since the only npm-published parser
 * for it ships with unpatched vulnerabilities.
 *
 * Parsing and column mapping happen entirely client-side (no server round
 * trip needed to try out a mapping); duplicate detection needs the
 * account's existing transactions, so that's the one server call between
 * the mapping and preview steps. Nothing is written to the database until
 * the user reviews the preview and clicks Import.
 */
export function ImportTransactionsModal({
  accountId,
  accountType,
  currency,
  checkImportDuplicates,
  importTransactions,
  onClose,
}: {
  accountId: string;
  accountType?: AccountType;
  currency: string;
  checkImportDuplicates: (formData: FormData) => Promise<boolean[]>;
  importTransactions: (formData: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("select");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  // The full parsed file, header row and all - which row is actually "the
  // header row" is a guess (see guessHeaderRowIndex) the user can correct,
  // so this is kept whole rather than immediately split into header/data.
  const [rawTable, setRawTable] = useState<string[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  // Whether a slash date's first number is the month (MDY, US) or the day
  // (DMY, most of the world) - not decidable from a single cell, so this
  // defaults to auto-detecting it from the whole mapped Date column (see
  // detectDateOrder) rather than assuming US format like File Import
  // originally did. Independent of `mapping` (not reset when the header
  // row changes) since it isn't derived from the header row.
  const [dateOrder, setDateOrder] = useState<"auto" | DateOrder>("auto");
  // Every single-column amount is negated automatically for a Credit Card
  // account, no user control - bank statement exports commonly report a
  // "charge amount" column as a plain positive number for a purchase, even
  // though a purchase on a credit card is an outflow (it increases what's
  // owed), the same "negative = outflow" convention every other amount in
  // this app already uses. Doesn't apply in split Inflow/Outflow mode:
  // those columns already carry explicit direction, so flipping there
  // would turn a refund into a charge instead of fixing anything.
  const flipSign = accountType === "CREDIT_CARD";
  const [mapping, setMapping] = useState<Mapping>({
    date: null,
    payee: null,
    memo: null,
    amountMode: "single",
    amount: null,
    inflow: null,
    outflow: null,
  });
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [pending, startTransition] = useTransition();

  // Rows strictly before headerRowIndex are preamble/metadata (an account
  // name, a statement period) and are dropped entirely here - they never
  // reach the preview step at all, rather than showing up there as rows
  // that happen to fail to parse.
  const headers = rawTable[headerRowIndex] ?? [];
  const dataRows = rawTable.slice(headerRowIndex + 1);

  // Re-derives the column mapping from whichever row is currently marked
  // as the header - called on file load (with the guessed index) and
  // whenever the user picks a different header row.
  function applyHeaderRow(table: string[][], index: number) {
    setHeaderRowIndex(index);
    const headerRow = table[index] ?? [];
    const hasInflowOutflow =
      guessColumn(headerRow, HEADER_HINTS.inflow) !== null ||
      guessColumn(headerRow, HEADER_HINTS.outflow) !== null;
    setMapping({
      date: guessColumn(headerRow, HEADER_HINTS.date),
      payee: guessColumn(headerRow, HEADER_HINTS.payee),
      memo: guessColumn(headerRow, HEADER_HINTS.memo),
      amountMode: hasInflowOutflow ? "split" : "single",
      amount: guessColumn(headerRow, HEADER_HINTS.amount),
      inflow: guessColumn(headerRow, HEADER_HINTS.inflow),
      outflow: guessColumn(headerRow, HEADER_HINTS.outflow),
    });
  }

  async function handleFile(file: File) {
    setFileError(null);
    setFileName(file.name);
    let table: string[][];
    try {
      table = await readImportFile(file);
    } catch (err) {
      setFileError(
        err instanceof Error ? err.message : "Couldn't read that file.",
      );
      return;
    }

    if (table.length < 2) {
      setFileError(
        "That file doesn't look like it has a header row and at least one transaction.",
      );
      return;
    }

    setRawTable(table);
    setDateOrder("auto");
    applyHeaderRow(table, guessHeaderRowIndex(table));
    setStep("mapping");
  }

  function buildPreview(): PreviewRow[] {
    const resolvedDateOrder: DateOrder =
      dateOrder === "auto"
        ? detectDateOrder(
            dataRows.map((cells) =>
              mapping.date !== null ? (cells[mapping.date] ?? "") : "",
            ),
          )
        : dateOrder;

    return dataRows.map((cells, i) => {
      const rawCell = (index: number | null) =>
        index !== null ? (cells[index] ?? "") : "";
      const cell = (index: number | null) => cleanCell(rawCell(index));

      const rawDate = rawCell(mapping.date);
      const date = parseImportDate(cell(mapping.date), resolvedDateOrder);
      const payeeName = cell(mapping.payee);
      const memo = cell(mapping.memo);
      const parsedAmount =
        mapping.amountMode === "single"
          ? parseSingleAmount(cell(mapping.amount))
          : parseSplitAmount(cell(mapping.inflow), cell(mapping.outflow));
      // Flip only applies in single-column mode: separate Inflow/Outflow
      // columns already carry explicit direction (that's the whole point
      // of mapping them separately), so flipping there would turn a
      // refund into a charge instead of fixing anything.
      const amount =
        parsedAmount === null
          ? null
          : flipSign && mapping.amountMode === "single"
            ? -parsedAmount
            : parsedAmount;

      let error: string | null = null;
      if (!date) {
        error = "Invalid or missing date";
        // A date that fails to parse despite looking fine on screen is
        // exactly the failure mode an invisible character or a Unicode
        // look-alike produces (see cleanCell) - neither shows up in a
        // screenshot, so logging the exact codepoints here means that
        // class of bug never again has to be diagnosed by guessing from
        // one. Only logs when there's something to see: a genuinely blank
        // cell isn't a mystery.
        if (typeof window !== "undefined" && rawDate) {
          console.warn(
            `[File Import] row ${i + 1}: Date column didn't parse`,
            {
              raw: rawDate,
              rawCodePoints: Array.from(rawDate, (c) =>
                "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0"),
              ),
              cleaned: cell(mapping.date),
              order: resolvedDateOrder,
            },
          );
        }
      } else if (amount === null) error = "Invalid or missing amount";

      return {
        rowIndex: i + 1,
        date: date ?? "",
        payeeName,
        memo,
        amount: amount ?? 0,
        error,
        duplicate: false,
        included: error === null,
      };
    });
  }

  function goToPreview() {
    const built = buildPreview();
    setRows(built);
    setStep("preview");

    const valid = built.filter((r) => !r.error);
    if (valid.length === 0) return;

    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set(
      "rows",
      JSON.stringify(
        valid.map(
          (r): ImportRow => ({
            date: r.date,
            payeeName: r.payeeName,
            memo: r.memo,
            amount: r.amount,
          }),
        ),
      ),
    );

    setCheckingDuplicates(true);
    startTransition(async () => {
      const flags = await checkImportDuplicates(formData);
      setCheckingDuplicates(false);
      setRows((current) => {
        let flagIndex = 0;
        return current.map((r) => {
          if (r.error) return r;
          const duplicate = flags[flagIndex++] ?? false;
          return { ...r, duplicate, included: !duplicate };
        });
      });
    });
  }

  function toggleRow(rowIndex: number) {
    setRows((current) =>
      current.map((r) =>
        r.rowIndex === rowIndex ? { ...r, included: !r.included } : r,
      ),
    );
  }

  function toggleAll(included: boolean) {
    setRows((current) =>
      current.map((r) => (r.error ? r : { ...r, included })),
    );
  }

  function handleImport() {
    const toImport = rows.filter((r) => r.included && !r.error);
    if (toImport.length === 0) return;

    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set(
      "rows",
      JSON.stringify(
        toImport.map(
          (r): ImportRow => ({
            date: r.date,
            payeeName: r.payeeName,
            memo: r.memo,
            amount: r.amount,
          }),
        ),
      ),
    );

    startTransition(async () => {
      await importTransactions(formData);
      onClose();
    });
  }

  const errorCount = rows.filter((r) => r.error).length;
  const duplicateCount = rows.filter((r) => r.duplicate).length;
  const includedCount = rows.filter((r) => r.included && !r.error).length;

  const mappingValid =
    mapping.date !== null &&
    (mapping.amountMode === "single"
      ? mapping.amount !== null
      : mapping.inflow !== null || mapping.outflow !== null);

  function columnSelect(
    label: string,
    value: number | null,
    onChange: (value: number | null) => void,
    required = false,
  ) {
    return (
      <div>
        <label className="mb-1 block text-small font-medium text-neutral-700">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
        <select
          value={value === null ? NONE : String(value)}
          onChange={(e) =>
            onChange(e.target.value === NONE ? null : Number(e.target.value))
          }
          className="w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
        >
          <option value={NONE}>{required ? "Choose a column…" : "None"}</option>
          {headers.map((h, i) => (
            <option key={i} value={i}>
              {h || `Column ${i + 1}`}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-800/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-neutral-0 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-300 py-200">
          <h2 className="text-h3 font-semibold text-neutral-800">
            Import transactions
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <Icon name="close" label="Close" className="text-[1.2em]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-300 py-300">
          {step === "select" && (
            <div className="space-y-3">
              <p className="text-body text-neutral-600">
                Choose a CSV or Excel (.xlsx) file exported from your bank.
                You&#39;ll be able to match its columns and review every row
                before anything is imported.
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                className="block w-full text-body file:mr-3 file:rounded file:border-0 file:bg-brand-700 file:px-3 file:py-1.5 file:text-small file:font-medium file:text-white hover:file:bg-brand-800"
              />
              <p className="text-small text-neutral-600">
                Legacy .xls files aren&#39;t supported yet - re-save as .xlsx or
                CSV first.
              </p>
              {fileError && (
                <p className="text-small text-danger">{fileError}</p>
              )}
            </div>
          )}

          {step === "mapping" && (
            <div className="space-y-4">
              <p className="text-body text-neutral-600">
                Match {fileName ? <strong>{fileName}</strong> : "the file"}
                &#39;s columns to a transaction&#39;s fields. Only Date and an
                amount are required.
              </p>

              {rawTable.length > 1 && (
                <div>
                  <label className="mb-1 block text-small font-medium text-neutral-700">
                    Header row
                  </label>
                  <p className="mb-2 text-small text-neutral-600">
                    Some exports include a few lines of account info before
                    the real column headers - pick the row that actually has
                    them if the highlighted guess below is wrong. Rows above
                    it are ignored.
                  </p>
                  <div className="overflow-x-auto rounded border border-neutral-200">
                    <table className="w-full text-small">
                      <tbody>
                        {rawTable.slice(0, 8).map((row, i) => (
                          <tr
                            key={i}
                            onClick={() => applyHeaderRow(rawTable, i)}
                            className={
                              "cursor-pointer border-t border-neutral-100 first:border-t-0 " +
                              (i === headerRowIndex
                                ? "bg-brand-700/10"
                                : "hover:bg-neutral-100")
                            }
                          >
                            <td className="w-6 px-2 py-1">
                              <input
                                type="radio"
                                name="header-row"
                                checked={i === headerRowIndex}
                                onChange={() => applyHeaderRow(rawTable, i)}
                              />
                            </td>
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className="max-w-[8rem] truncate px-2 py-1"
                              >
                                {cell || (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {columnSelect("Date", mapping.date, (v) =>
                  setMapping((m) => ({ ...m, date: v })),
                  true,
                )}
                {columnSelect("Payee", mapping.payee, (v) =>
                  setMapping((m) => ({ ...m, payee: v })),
                )}
                {columnSelect("Memo", mapping.memo, (v) =>
                  setMapping((m) => ({ ...m, memo: v })),
                )}
              </div>

              {mapping.date !== null && (
                <div>
                  <label className="mb-1 block text-small font-medium text-neutral-700">
                    Date format
                  </label>
                  <p className="mb-2 text-small text-neutral-600">
                    Only matters for dates written as e.g. 03/08/2026 or
                    03-08-2026 - ambiguous between day and month. ISO dates
                    (2026-08-03) don&#39;t need this.
                  </p>
                  <div className="flex gap-1 text-small">
                    {(
                      [
                        ["auto", "Auto-detect"],
                        ["DMY", "Day/Month/Year"],
                        ["MDY", "Month/Day/Year"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setDateOrder(value)}
                        className={
                          "rounded border px-2 py-1 " +
                          (dateOrder === value
                            ? "border-brand-700 bg-brand-700/10 text-brand-700"
                            : "border-neutral-200 text-neutral-600 hover:bg-neutral-100")
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-small font-medium text-neutral-700">
                  Amount
                </label>
                <div className="mb-2 flex gap-1 text-small">
                  <button
                    type="button"
                    onClick={() =>
                      setMapping((m) => ({ ...m, amountMode: "single" }))
                    }
                    className={
                      "rounded border px-2 py-1 " +
                      (mapping.amountMode === "single"
                        ? "border-brand-700 bg-brand-700/10 text-brand-700"
                        : "border-neutral-200 text-neutral-600 hover:bg-neutral-100")
                    }
                  >
                    Single column
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMapping((m) => ({ ...m, amountMode: "split" }))
                    }
                    className={
                      "rounded border px-2 py-1 " +
                      (mapping.amountMode === "split"
                        ? "border-brand-700 bg-brand-700/10 text-brand-700"
                        : "border-neutral-200 text-neutral-600 hover:bg-neutral-100")
                    }
                  >
                    Separate Inflow / Outflow
                  </button>
                </div>

                {mapping.amountMode === "single" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {columnSelect(
                      "Amount (negative = outflow)",
                      mapping.amount,
                      (v) => setMapping((m) => ({ ...m, amount: v })),
                      true,
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {columnSelect("Inflow", mapping.inflow, (v) =>
                      setMapping((m) => ({ ...m, inflow: v })),
                    )}
                    {columnSelect("Outflow", mapping.outflow, (v) =>
                      setMapping((m) => ({ ...m, outflow: v })),
                    )}
                  </div>
                )}

                {flipSign && mapping.amountMode === "single" && (
                  <p className="mt-2 flex items-start gap-1.5 text-small text-neutral-600">
                    <Icon
                      name="info"
                      className="mt-0.5 shrink-0 text-[1.1em]"
                    />
                    This account is a credit card, so amounts are
                    automatically flipped (positive → outflow, negative →
                    inflow) - a statement&#39;s charge amount is usually a
                    plain positive number even though it&#39;s money owed.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-small text-neutral-600">
                <span>
                  {rows.length} row{rows.length === 1 ? "" : "s"} parsed ·{" "}
                  {includedCount} will be imported
                  {duplicateCount > 0 && ` · ${duplicateCount} possible duplicate${duplicateCount === 1 ? "" : "s"}`}
                  {errorCount > 0 && ` · ${errorCount} couldn't be parsed`}
                  {checkingDuplicates && " · checking for duplicates…"}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAll(true)}
                    className="text-brand-700 hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAll(false)}
                    className="text-brand-700 hover:underline"
                  >
                    Select none
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded border border-neutral-200">
                <table className="w-full text-small">
                  <thead className="bg-neutral-100 text-neutral-600">
                    <tr>
                      <th className="w-8 px-2 py-1" />
                      <th className="px-2 py-1 text-left font-medium">Date</th>
                      <th className="px-2 py-1 text-left font-medium">Payee</th>
                      <th className="px-2 py-1 text-left font-medium">Memo</th>
                      <th className="px-2 py-1 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.rowIndex}
                        title={
                          r.error
                            ? r.error
                            : r.duplicate
                              ? "Possible duplicate"
                              : undefined
                        }
                        className={
                          "border-t border-neutral-100 " +
                          (r.error
                            ? "text-neutral-400"
                            : r.duplicate
                              ? "bg-warning/10"
                              : "")
                        }
                      >
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={r.included}
                            disabled={!!r.error}
                            onChange={() => toggleRow(r.rowIndex)}
                          />
                        </td>
                        <td className="px-2 py-1">{r.date || "—"}</td>
                        <td className="max-w-[10rem] truncate px-2 py-1">
                          {r.payeeName || "—"}
                        </td>
                        <td className="max-w-[10rem] truncate px-2 py-1">
                          {r.memo || "—"}
                        </td>
                        <td
                          className={
                            "px-2 py-1 text-right " +
                            (r.error
                              ? ""
                              : r.amount < 0
                                ? "text-danger"
                                : "text-success")
                          }
                        >
                          {r.error
                            ? "—"
                            : formatMilliunits(numberToMilliunits(r.amount), currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200 px-300 py-200">
          <button
            type="button"
            onClick={() => {
              if (step === "mapping") setStep("select");
              else if (step === "preview") setStep("mapping");
              else onClose();
            }}
            disabled={pending}
            className="rounded px-3 py-1.5 text-small text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
          >
            {step === "select" ? "Cancel" : "Back"}
          </button>

          {step === "mapping" && (
            <button
              type="button"
              onClick={goToPreview}
              disabled={!mappingValid}
              className="rounded bg-brand-700 px-3 py-1.5 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              Continue to preview
            </button>
          )}

          {step === "preview" && (
            <button
              type="button"
              onClick={handleImport}
              disabled={pending || includedCount === 0}
              className="rounded bg-brand-700 px-3 py-1.5 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {pending
                ? "Importing…"
                : `Import ${includedCount} transaction${includedCount === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Build a clean .xlsx for Veronica to hand off: the original rows, untouched,
 * plus a real numeric TOTAL written below the "Amount entered" column and a
 * small summary block. The totals are written as genuine numbers (not text),
 * so this workbook's SUM works where the WorldFirst original did not.
 */

import ExcelJS from "exceljs";
import { parseIncomeWorkbook, letterToColumn } from "./parse";
import type { IncomeSummary } from "./types";

const ACCENT = "FF15803D"; // reconciled green (argb)
const INK = "FF171717";

/**
 * Returns a Node Buffer of the summarized workbook. Re-reads the original file
 * to preserve its columns, then appends totals below the amount column.
 */
export async function buildIncomeExport(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
): Promise<{ buffer: Buffer; summary: IncomeSummary; outName: string }> {
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const summary = await parseIncomeWorkbook(nodeBuffer, { fileName });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    nodeBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.worksheets[0];

  const amountColIndex = letterToColumn(summary.amountColumn);
  const labelColIndex = Math.max(1, amountColIndex - 1);
  const lastDataRow = sheet.rowCount;

  // One blank spacer row, then a TOTAL line per currency.
  let cursor = lastDataRow + 2;
  for (const t of summary.totalsByCurrency) {
    const labelCell = sheet.getCell(cursor, labelColIndex);
    const valueCell = sheet.getCell(cursor, amountColIndex);

    const label =
      summary.totalsByCurrency.length > 1 ? `TOTAL (${t.currency})` : "TOTAL";
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: INK } };
    labelCell.alignment = { horizontal: "right" };

    valueCell.value = t.cents / 100; // a REAL number
    valueCell.numFmt = "#,##0.00";
    valueCell.font = { bold: true, color: { argb: ACCENT } };
    valueCell.border = { top: { style: "thin", color: { argb: INK } } };

    cursor++;
  }

  // Compact summary block a couple of rows down.
  cursor += 1;
  const meta: [string, string][] = [
    ["Source file", fileName],
    ["Amount column", `${summary.amountColumn}: ${summary.amountHeader}`],
    ["Rows counted", String(summary.rows.length)],
    ["Rows skipped", String(summary.skipped.length)],
  ];
  for (const [k, v] of meta) {
    const kc = sheet.getCell(cursor, labelColIndex);
    kc.value = k;
    kc.font = { italic: true, color: { argb: "FF737373" } };
    kc.alignment = { horizontal: "right" };
    sheet.getCell(cursor, amountColIndex).value = v;
    cursor++;
  }

  const out = await workbook.xlsx.writeBuffer();
  const base = fileName.replace(/\.xlsx$/i, "");
  const outName = `${base} summarized.xlsx`;
  return { buffer: Buffer.from(out), summary, outName };
}

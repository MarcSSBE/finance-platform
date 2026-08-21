/**
 * Deterministic parser for WorldFirst income exports (Project 1).
 *
 * Reads the workbook, finds the "Amount entered" column (default D), coerces the
 * text values to numbers, and totals them per currency — all in plain code so
 * the result is exact and auditable. Claude is NOT involved in the arithmetic.
 */

import ExcelJS from "exceljs";
import { z } from "zod";
import { parseAmountToCents } from "./money";
import { extractStructured, isAiEnabled } from "@/lib/ai/claude";
import type {
  CurrencyTotal,
  IncomeRow,
  IncomeSummary,
  SkippedRow,
} from "./types";

const EXPECTED_AMOUNT_HEADER = "amount entered";
const HEADER_ALIASES = ["amount entered", "amount", "in", "transaction amount"];

/** Convert a 1-based column index to its letter (1 -> "A", 4 -> "D"). */
function columnLetter(index: number): string {
  let n = index;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Read a cell's value as a trimmed display string. */
function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return "";
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    // ExcelJS rich text / formula result objects.
    const anyV = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof anyV.text === "string") return anyV.text.trim();
    if (Array.isArray(anyV.richText)) return anyV.richText.map((r) => r.text).join("").trim();
    if (anyV.result !== undefined && anyV.result !== null) return String(anyV.result).trim();
    return "";
  }
  return String(v).trim();
}

export interface ParseOptions {
  /** Force a specific amount column letter (e.g. "D"); otherwise it is detected. */
  amountColumn?: string;
  fileName?: string;
}

/**
 * Parse a WorldFirst export from an .xlsx buffer into a deterministic summary.
 * Throws only when the file cannot be opened or has no usable header row.
 */
export async function parseIncomeWorkbook(
  buffer: ArrayBuffer | Buffer,
  options: ParseOptions = {},
): Promise<IncomeSummary> {
  const workbook = new ExcelJS.Workbook();
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  // ExcelJS's bundled types predate the generic Buffer<ArrayBufferLike>; the
  // runtime accepts a Node Buffer exactly as provided.
  await workbook.xlsx.load(
    nodeBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The file has no worksheets.");

  const headerRow = sheet.getRow(1);
  const headers: { index: number; text: string }[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers.push({ index: colNumber, text: cellText(cell) });
  });
  if (headers.length === 0) throw new Error("The first row has no headers.");

  // Locate the amount column: honor an explicit choice, else match by header.
  let amountColIndex: number | undefined;
  let amountHeader = "";
  let inferred = false;

  if (options.amountColumn) {
    amountColIndex = letterToColumn(options.amountColumn);
    amountHeader = headers.find((h) => h.index === amountColIndex)?.text ?? "";
  } else {
    for (const alias of HEADER_ALIASES) {
      const match = headers.find((h) => h.text.toLowerCase() === alias);
      if (match) {
        amountColIndex = match.index;
        amountHeader = match.text;
        inferred = alias !== EXPECTED_AMOUNT_HEADER;
        break;
      }
    }
  }

  // Fallback: if no header matched (a reformatted/renamed export) and a key is
  // present, ask Claude which column holds the amount. The SUM stays 100%
  // deterministic — only the column CHOICE is AI-assisted.
  if (!amountColIndex && !options.amountColumn && isAiEnabled()) {
    const aiCol = await aiDetectAmountColumn(headers);
    if (aiCol) {
      amountColIndex = aiCol.index;
      amountHeader = aiCol.text;
      inferred = true;
    }
  }

  if (!amountColIndex) {
    throw new Error(
      'Could not find an "Amount entered" column. Please check the file is a WorldFirst export.',
    );
  }

  // Identify helpful context columns by header (best-effort, non-fatal).
  const typeCol = headers.find((h) => h.text.toLowerCase() === "transaction type")?.index;
  const descCol = headers.find((h) => h.text.toLowerCase() === "description")?.index;
  const currencyCol = headers.find((h) => h.text.toLowerCase() === "currency")?.index;

  const rows: IncomeRow[] = [];
  const skipped: SkippedRow[] = [];
  const totalsMap = new Map<string, { cents: number; count: number }>();
  let negativeCount = 0;
  let totalRows = 0;

  const lastRow = sheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const rawAmount = cellText(row.getCell(amountColIndex));
    const type = typeCol ? cellText(row.getCell(typeCol)) : "";
    const description = descCol ? cellText(row.getCell(descCol)) : "";
    const currency = (currencyCol ? cellText(row.getCell(currencyCol)) : "") || "—";

    // A truly empty row (no amount and no context) is not a skipped row, just spacing.
    const rowIsBlank = rawAmount === "" && type === "" && description === "";
    if (rowIsBlank) continue;

    totalRows++;

    const parsed = parseAmountToCents(rawAmount);
    if (parsed === null) {
      skipped.push({
        rowNumber: r,
        raw: rawAmount,
        reason: rawAmount === "" ? "No amount in this row" : "Amount is not a number",
      });
      continue;
    }

    if (parsed.cents < 0) negativeCount++;

    rows.push({
      rowNumber: r,
      type,
      description,
      currency,
      raw: rawAmount,
      cents: parsed.cents,
    });

    const bucket = totalsMap.get(currency) ?? { cents: 0, count: 0 };
    bucket.cents += parsed.cents;
    bucket.count += 1;
    totalsMap.set(currency, bucket);
  }

  const totalsByCurrency: CurrencyTotal[] = [...totalsMap.entries()]
    .map(([currency, v]) => ({ currency, cents: v.cents, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return {
    fileName: options.fileName ?? "",
    amountColumn: columnLetter(amountColIndex),
    amountHeader,
    amountColumnInferred: inferred,
    totalRows,
    rows,
    totalsByCurrency,
    skipped,
    negativeCount,
  };
}

const aiColumnSchema = z.object({ columnHeader: z.string() });

/** Ask Claude which header names the monetary amount to total. Returns the
 *  matching header entry, or null if unavailable/no confident match. */
async function aiDetectAmountColumn(
  headers: { index: number; text: string }[],
): Promise<{ index: number; text: string } | null> {
  const list = headers.map((h) => h.text).filter(Boolean);
  const result = await extractStructured({
    toolName: "pick_amount_column",
    toolDescription: "Pick the column header that holds the monetary amount to total.",
    prompt:
      "These are the column headers of a payment-provider export of INCOME received:\n" +
      list.map((t) => `- ${t}`).join("\n") +
      "\n\nWhich single header names the amount of money received that should be summed? Return the header exactly as written.",
    jsonSchema: {
      type: "object",
      properties: { columnHeader: { type: "string" } },
      required: ["columnHeader"],
    },
    schema: aiColumnSchema,
  });
  if (!result) return null;
  const match = headers.find(
    (h) => h.text.toLowerCase() === result.columnHeader.trim().toLowerCase(),
  );
  return match ?? null;
}

/** Convert a column letter (e.g. "D") to a 1-based index (4). */
export function letterToColumn(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

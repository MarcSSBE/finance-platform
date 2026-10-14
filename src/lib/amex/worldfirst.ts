import ExcelJS from "exceljs";
import type { AmexLine, AmexLineKind, AmexStatement } from "./types";

/**
 * Parser for the WorldFirst account statement export (.xlsx, sheet
 * "StatementSummary"), which Veronica checks for missing receipts the same way
 * as the Amex statement. One row per movement, newest first:
 *
 *   Date | Description | In | Out | Balance | Currency | Payment fee | ... | Reference
 *   30 Sep, 2026 | OPENPHONE SAN FRANCISCO USA(************9556)\n2026093016231004... | | 19.00 | ... | USD
 *
 * Card purchases are what need a receipt. The amount is already in the
 * currency charged (USD/EUR/GBP accounts), so it is what the receipt shows.
 * Left out of the check, as she does by hand: transfers and withdrawals (their
 * documents are saved when paying) and TikTok Ads (filed with their invoices
 * by the Ads feature). All money is read by code, never by the LLM.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Read a cell as a trimmed string (plain, rich text or formula result). */
function cellText(cell: ExcelJS.Cell | undefined): string {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof o.text === "string") return o.text.trim();
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("").trim();
    if (o.result !== undefined && o.result !== null) return String(o.result).trim();
    return "";
  }
  return String(v).trim();
}

/** "1584.00", "1,584.00" or a numeric cell → integer cents; "" → null. */
export function parseWfAmount(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, "");
  const m = s.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const cents = parseInt(m[2], 10) * 100 + parseInt((m[3] ?? "0").padEnd(2, "0"), 10);
  return m[1] ? -cents : cents;
}

/** "30 Sep, 2026" (or an ISO date from a date cell) → "2026-09-30". */
function toIso(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2].toLowerCase());
  if (mon < 0) return null;
  return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const DAY_MS = 86_400_000;
const isoMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * A card row's second line starts with the transaction date as yyyymmdd
 * ("2026083116231004..." on a row posted 01 Sep). Use it when it is a real
 * date within a week before posting; otherwise the posting date.
 */
function transactionDate(reference: string, postedISO: string): string {
  const m = reference.match(/^(20\d{2})(\d{2})(\d{2})/);
  if (!m) return postedISO;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const diff = (isoMs(postedISO) - isoMs(iso)) / DAY_MS;
  return Number.isFinite(diff) && diff >= 0 && diff <= 7 ? iso : postedISO;
}

function classify(description: string, inCents: number | null, outCents: number | null): AmexLineKind {
  if (/^(transfer|withdrawal)-/i.test(description)) return "transfer";
  if (/tik\s*tok\s*ads/i.test(description)) return "tiktok-ads";
  if ((inCents ?? 0) > 0 && !(outCents ?? 0)) return "credit";
  return "purchase";
}

/** Period from the export's file name ("..._2026-09-01_2026-09-30.xlsx"), if present. */
function periodFromName(fileName: string): [string, string] | null {
  const m = fileName.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})/);
  return m ? [m[1], m[2]] : null;
}

export async function parseWorldFirstStatement(
  buffer: ArrayBuffer | Buffer,
  fileName = "",
): Promise<AmexStatement> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  const lines: AmexLine[] = [];
  for (const ws of wb.worksheets) {
    // Find the header row and its columns by name, not position.
    let headerRow = 0;
    const col: Record<string, number> = {};
    for (let r = 1; r <= Math.min(ws.rowCount, 20) && !headerRow; r++) {
      const row = ws.getRow(r);
      const found: Record<string, number> = {};
      row.eachCell((cell, c) => {
        const h = cellText(cell).toLowerCase();
        if (["date", "description", "in", "out", "currency"].includes(h) && !(h in found)) found[h] = c;
      });
      if (["date", "description", "out", "currency"].every((h) => h in found)) {
        headerRow = r;
        Object.assign(col, found);
      }
    }
    if (!headerRow) continue;

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const posted = toIso(cellText(row.getCell(col.date)));
      if (!posted) continue;
      const [first, ...rest] = cellText(row.getCell(col.description)).split(/\r?\n/);
      const description = first.replace(/\(\*+\d{4}\)/g, "").replace(/\s+/g, " ").trim();
      const outCents = parseWfAmount(cellText(row.getCell(col.out)));
      const inCents = col.in ? parseWfAmount(cellText(row.getCell(col.in))) : null;
      if (!outCents && !inCents) continue;
      const currency = cellText(row.getCell(col.currency)).toUpperCase();
      const kind = classify(description, inCents, outCents);
      // Money out is the charge; money in (a refund) is stored negative, as on Amex.
      const cents = outCents ? outCents : -(inCents ?? 0);
      lines.push({
        dateISO: transactionDate((rest.join(" ").trim()), posted),
        processDateISO: posted,
        description,
        sekCents: 0,
        originalCents: cents,
        originalCurrency: currency,
        feeSekCents: 0,
        kind,
        needsReceipt: kind === "purchase",
      });
    }
  }

  // Oldest first, like the Amex statement.
  lines.reverse();
  const dates = lines.map((l) => l.processDateISO).sort();
  const period = periodFromName(fileName) ?? [dates[0] ?? "", dates[dates.length - 1] ?? ""];

  return {
    source: "worldfirst",
    statementDateISO: period[1],
    periodStartISO: period[0],
    periodEndISO: period[1],
    cardEnding: "",
    lines,
    printedPurchasesCents: null,
    parsedPurchasesCents: 0,
    totalsMatch: true,
  };
}

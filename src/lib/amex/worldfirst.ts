import ExcelJS from "exceljs";
import { extractPdfItems } from "../pdf";
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
  // A conversion between her own currency accounts is not a purchase either.
  if (/^(transfer|withdrawal|conversion)-/i.test(description)) return "transfer";
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
      const line = toLine(
        posted,
        first,
        rest.join(" ").trim(),
        col.in ? parseWfAmount(cellText(row.getCell(col.in))) : null,
        parseWfAmount(cellText(row.getCell(col.out))),
        cellText(row.getCell(col.currency)).toUpperCase(),
      );
      if (line) lines.push(line);
    }
  }

  return toStatement(lines, periodFromName(fileName), true);
}

/** One statement row → a line; null when it moves no money. */
function toLine(
  posted: string,
  rawDescription: string,
  reference: string,
  inCents: number | null,
  outCents: number | null,
  currency: string,
): AmexLine | null {
  if (!outCents && !inCents) return null;
  const description = rawDescription
    .replace(/\(\*+\d{4}\)/g, "")
    .replace(/\s+/g, " ")
    // Rejoin what the PDF wrapped: "Fulfillment- Box(DE742905010100829621 27)".
    .replace(/([A-Za-z])- (?=[A-Za-z])/g, "$1-")
    .replace(/\(([A-Z0-9 ]+)\)/g, (_, inner: string) => `(${inner.replace(/ /g, "")})`)
    .trim();
  const kind = classify(description, inCents, outCents);
  return {
    dateISO: transactionDate(reference, posted),
    processDateISO: posted,
    description,
    sekCents: 0,
    // Money out is the charge; money in (a refund) is stored negative, as on Amex.
    originalCents: outCents ? outCents : -(inCents ?? 0),
    originalCurrency: currency,
    feeSekCents: 0,
    kind,
    needsReceipt: kind === "purchase",
  };
}

/** Rows newest first (as WorldFirst lists them) → the statement, oldest first like Amex. */
function toStatement(newestFirst: AmexLine[], period: [string, string] | null, totalsMatch: boolean): AmexStatement {
  const lines = [...newestFirst].reverse();
  const dates = lines.map((l) => l.processDateISO).sort();
  const [start, end] = period ?? [dates[0] ?? "", dates[dates.length - 1] ?? ""];
  return {
    source: "worldfirst",
    statementDateISO: end,
    periodStartISO: start,
    periodEndISO: end,
    cardEnding: "",
    lines,
    printedPurchasesCents: null,
    parsedPurchasesCents: 0,
    totalsMatch,
  };
}

// ── PDF statement ───────────────────────────────────────────────────────────

/** Is this PDF text a WorldFirst currency-account statement (not an Amex one)? */
export function isWorldFirstPdfText(text: string): boolean {
  return /Statement for [A-Z]{3} currency account/.test(text) && /World ?First/i.test(text);
}

/** "387.50 USD" → [38750, "USD"]. */
function pdfAmount(s: string): [number, string] | null {
  const m = s.match(/^(\d[\d,]*(?:\.\d{1,2})?)\s+([A-Z]{3})$/);
  const cents = m ? parseWfAmount(m[1]) : null;
  return m && cents !== null ? [cents, m[2]] : null;
}

/**
 * The monthly statement PDF WorldFirst issues per currency account ("Statement
 * for USD currency account"), which Veronica may send instead of the .xlsx
 * export. Same rows, laid out as a table:
 *
 *   DATE         | Description (wrapped)             | IN | OUT        | BALANCE
 *   30 Aug, 2026 | OPENPHONE SAN / FRANCISCO /       |    | 19.00 USD  | 449978.47 USD
 *                | USA(************9556) / 2026083…  |    |            |
 *
 * The flat text cannot tell IN from OUT (one of them is blank), so rows are
 * rebuilt from text positions: a row starts at a date in the DATE column and
 * runs to the next one; IN/OUT is decided by the column header the amount
 * sits under. The rows are then checked against the printed summary (In and
 * Out totals, opening + in - out = closing), so a row the layout hid shows as
 * a totals mismatch instead of a silently missing charge.
 */
export async function parseWorldFirstPdf(buffer: ArrayBuffer | Buffer): Promise<AmexStatement> {
  const items = await extractPdfItems(buffer);
  const all = items.map((i) => i.str).join("\n");
  const currency = all.match(/Statement for ([A-Z]{3}) currency account/)?.[1] ?? "";
  const period = all.match(
    /Transactions time\s*:\s*(\d{1,2} [A-Za-z]{3}, \d{4})\s+to\s+(\d{1,2} [A-Za-z]{3}, \d{4})/,
  );
  const start = period ? toIso(period[1]) : null;
  const end = period ? toIso(period[2]) : null;

  // Printed summary: the label, then its figure further right on the same line.
  const summary = (label: string): number | null => {
    const l = items.find((i) => i.page === 1 && i.str === label);
    const v = l && items.find((i) => i.page === 1 && Math.abs(i.y - l.y) < 1 && i.x > l.x && pdfAmount(i.str));
    return v ? pdfAmount(v.str)![0] : null;
  };

  const rows: AmexLine[] = [];
  let sumIn = 0;
  let sumOut = 0;
  for (const page of [...new Set(items.map((i) => i.page))]) {
    const own = items.filter((i) => i.page === page);
    const [date, desc, inH, outH, bal] = ["DATE", "Description", "IN", "OUT", "BALANCE"].map((name) =>
      own.find((i) => i.str === name),
    );
    if (!date || !desc || !inH || !outH || !bal) continue;
    if (![desc, inH, outH, bal].every((h) => Math.abs(h.y - date.y) < 1)) continue;
    const below = own.filter((i) => i.y < date.y - 1);
    const starts = below.filter((i) => i.x < desc.x - 5 && toIso(i.str)).sort((a, b) => b.y - a.y);
    starts.forEach((s, k) => {
      const floor = starts[k + 1]?.y ?? -Infinity;
      // A row's items sit on its first line or below it, above the next row.
      const cell = (from: number, to: number) =>
        below.filter((i) => i.y <= s.y + 1 && i.y > floor + 1 && i.x >= from - 5 && i.x < to - 5);
      const text = cell(desc.x, inH.x)
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map((i) => i.str)
        .join(" ");
      const money = (from: number, to: number) => {
        const found = cell(from, to)
          .map((i) => pdfAmount(i.str))
          .filter((a): a is [number, string] => a !== null);
        return found.length === 1 ? found[0] : null;
      };
      const inA = money(inH.x, outH.x);
      const outA = money(outH.x, bal.x);
      // The card reference ("20260830162310040345762 03181512") follows the merchant text.
      const ref = text.match(/\b(20\d{6}\d{8,})\b/);
      const line = toLine(
        toIso(s.str)!,
        ref ? text.slice(0, ref.index) : text,
        ref ? ref[1] : "",
        inA?.[0] ?? null,
        outA?.[0] ?? null,
        (outA ?? inA)?.[1] ?? currency,
      );
      if (!line) return;
      rows.push(line);
      sumIn += inA?.[0] ?? 0;
      sumOut += outA?.[0] ?? 0;
    });
  }

  const [open, printedIn, printedOut, close] = ["Opening balance", "In", "Out", "Closing balance"].map(summary);
  const totalsMatch =
    printedIn !== null &&
    printedOut !== null &&
    sumIn === printedIn &&
    sumOut === printedOut &&
    (open === null || close === null || open + printedIn - printedOut === close);

  return { ...toStatement(rows, start && end ? [start, end] : null, totalsMatch), account: currency || undefined };
}

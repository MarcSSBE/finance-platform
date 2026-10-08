import { extractPdfItems, type PdfTextItem } from "@/lib/pdf";
import type { AmexLine, AmexLineKind, AmexStatement } from "./types";

/**
 * Parser for the American Express statement PDF (SAS Amex Elite, Swedish).
 *
 * The flat text layer lists every description first and every amount later, so
 * rows are rebuilt from positions instead. Each page has two columns; a
 * transaction starts on a line holding two dates (Transaktionsdatum,
 * Processdatum) with the SEK amount right-aligned on the same line. Foreign
 * purchases are followed by a block:
 *
 *   Köp i utländsk valuta     197.00  USD
 *   Summa Avgifter SEK         38,91  Valutakurs 0.1012
 *
 * The SEK figure includes that fee, so the original amount is what a receipt
 * shows and what matching must use.
 */

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{2})$/;
const AMOUNT_RE = /^-?\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}$/;
/** Page midline in points; left column x≈14, right column x≈281. */
const COLUMN_SPLIT = 270;
/** A transaction block never runs taller than this (row line + 2 description lines + foreign block). */
const MAX_BLOCK_HEIGHT = 70;
const SAME_LINE = 2;

/**
 * Parse "1.984,24" (Swedish), "1,000.00" (US) or "25,00" into integer cents.
 * The last separator followed by exactly two digits is the decimal mark.
 */
export function parseAmountCents(raw: string): number | null {
  const s = raw.replace(/\s/g, "");
  const m = s.match(/^(-?)([\d.,]*\d)[.,](\d{2})$/);
  if (!m) return null;
  const whole = m[2].replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole)) return null;
  const cents = parseInt(whole, 10) * 100 + parseInt(m[3], 10);
  return m[1] ? -cents : cents;
}

/** "02.10.26" → "2026-10-02". */
function toIso(ddmmyy: string): string | null {
  const m = ddmmyy.match(DATE_RE) ?? ddmmyy.match(/(\d{2})\.(\d{2})\.(\d{2})/);
  if (!m) return null;
  return `20${m[3]}-${m[2]}-${m[1]}`;
}

const column = (it: PdfTextItem) => (it.x < COLUMN_SPLIT ? 0 : 1);
const sameLine = (a: number, b: number) => Math.abs(a - b) <= SAME_LINE;

interface RowAnchor {
  page: number;
  col: number;
  x: number;
  y: number;
  dateISO: string;
  processDateISO: string;
}

/** Rows start where a date has a second date just to its right on the same line. */
function findRowAnchors(items: PdfTextItem[]): RowAnchor[] {
  const anchors: RowAnchor[] = [];
  for (const it of items) {
    if (!DATE_RE.test(it.str)) continue;
    const process = items.find(
      (o) =>
        o !== it &&
        o.page === it.page &&
        sameLine(o.y, it.y) &&
        o.x > it.x + 20 &&
        o.x < it.x + 60 &&
        DATE_RE.test(o.str),
    );
    if (!process) continue;
    anchors.push({
      page: it.page,
      col: column(it),
      x: it.x,
      y: it.y,
      dateISO: toIso(it.str)!,
      processDateISO: toIso(process.str)!,
    });
  }
  return anchors;
}

function classify(description: string, credit: boolean): AmexLineKind {
  if (/betalning mottagen/i.test(description)) return "payment";
  if (/årsavgift/i.test(description)) return "card-fee";
  return credit ? "credit" : "purchase";
}

function buildLine(anchor: RowAnchor, block: PdfTextItem[]): AmexLine | null {
  // SEK amount: right-aligned on the anchor line.
  const amountItem = block
    .filter((it) => sameLine(it.y, anchor.y) && it.x > anchor.x + 150 && AMOUNT_RE.test(it.str))
    .sort((a, b) => b.x - a.x)[0];
  if (!amountItem) return null;
  let sekCents = parseAmountCents(amountItem.str)!;
  const credit = block.some((it) => it.str === "CR");

  // Foreign block: a 3-letter currency code on the "Köp i utländsk" line,
  // with the original amount immediately to its left.
  const descX = anchor.x + 70;
  const kopLine = block.find((it) => it.str === "Köp" && it.y < anchor.y - 1 && it.x >= descX);
  let originalCents = Math.abs(sekCents);
  let originalCurrency = "SEK";
  let feeSekCents = 0;
  if (kopLine) {
    const currency = block.find(
      (it) => sameLine(it.y, kopLine.y) && /^[A-Z]{3}$/.test(it.str) && it.str !== "SEK",
    );
    const original = currency
      ? block
          .filter((it) => sameLine(it.y, kopLine.y) && it.x < currency.x && parseAmountCents(it.str) !== null)
          .sort((a, b) => b.x - a.x)[0]
      : undefined;
    if (currency && original) {
      originalCurrency = currency.str;
      originalCents = Math.abs(parseAmountCents(original.str)!);
    }
    const feeLabel = block.find((it) => it.str === "Avgifter" && it.y < kopLine.y);
    const rateLabel = feeLabel && block.find((it) => it.str === "Valutakurs" && sameLine(it.y, feeLabel.y));
    if (feeLabel && rateLabel) {
      const fee = block.find(
        (it) => sameLine(it.y, feeLabel.y) && it.x > feeLabel.x && it.x < rateLabel.x && parseAmountCents(it.str) !== null,
      );
      if (fee) feeSekCents = parseAmountCents(fee.str)!;
    }
  }

  // Description: text between the dates and the amount, above the foreign block.
  const description = block
    .filter(
      (it) =>
        it.x >= descX - 2 &&
        it.x < amountItem.x - 5 &&
        it.y <= anchor.y + SAME_LINE &&
        (!kopLine || it.y > kopLine.y + 1) &&
        it.str !== "CR",
    )
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((it) => it.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const kind = classify(description, credit);
  if ((kind === "payment" || kind === "credit") && sekCents > 0) sekCents = -sekCents;
  const sign = sekCents < 0 ? -1 : 1;

  return {
    dateISO: anchor.dateISO,
    processDateISO: anchor.processDateISO,
    description,
    sekCents,
    originalCents: sign * originalCents,
    originalCurrency,
    feeSekCents,
    kind,
    needsReceipt: kind === "purchase",
  };
}

/** The amount printed on the same line as a label, e.g. "Summan av alla nya köp  246.839,24". */
function amountBesideLabel(items: PdfTextItem[], label: RegExp): number | null {
  const at = items.find((it) => label.test(it.str));
  if (!at) return null;
  const amount = items.find(
    (it) => it.page === at.page && sameLine(it.y, at.y) && it.x > at.x && AMOUNT_RE.test(it.str),
  );
  return amount ? parseAmountCents(amount.str) : null;
}

export function parseAmexItems(items: PdfTextItem[]): AmexStatement {
  const header = (re: RegExp) => items.map((it) => it.str.match(re)).find(Boolean) ?? null;
  const statementDate = header(/Fakturadatum:\s*(\d{2}\.\d{2}\.\d{2})/);
  const period = header(/Fakturans period:\s*(\d{2}\.\d{2}\.\d{2})\s*till\s*(\d{2}\.\d{2}\.\d{2})/);
  const card = header(/Kortnummer som slutar på:\s*(\d+)/);

  const anchors = findRowAnchors(items);
  const lines: AmexLine[] = [];
  for (const anchor of anchors) {
    const colItems = items.filter((it) => it.page === anchor.page && column(it) === anchor.col);
    // The block ends at the next row in this column, at any non-date text in the
    // date column (section totals, the interest table), or at the height cap.
    const nextRowY = Math.max(
      anchor.y - MAX_BLOCK_HEIGHT,
      ...anchors
        .filter((a) => a.page === anchor.page && a.col === anchor.col && a.y < anchor.y - SAME_LINE)
        .map((a) => a.y),
      ...colItems
        .filter((it) => it.y < anchor.y - SAME_LINE && Math.abs(it.x - anchor.x) < 12 && !DATE_RE.test(it.str))
        .map((it) => it.y),
    );
    const block = colItems.filter((it) => it.y <= anchor.y + SAME_LINE && it.y > nextRowY + SAME_LINE / 2);
    const line = buildLine(anchor, block);
    if (line) lines.push(line);
  }

  const parsedPurchasesCents = lines
    .filter((l) => l.kind !== "payment")
    .reduce((sum, l) => sum + l.sekCents, 0);
  const printedPurchasesCents = amountBesideLabel(items, /^Summan av alla nya köp$/i);

  return {
    statementDateISO: statementDate ? toIso(statementDate[1]) ?? "" : "",
    periodStartISO: period ? toIso(period[1]) ?? "" : "",
    periodEndISO: period ? toIso(period[2]) ?? "" : "",
    cardEnding: card ? card[1] : "",
    lines,
    printedPurchasesCents,
    parsedPurchasesCents,
    totalsMatch: printedPurchasesCents !== null && printedPurchasesCents === parsedPurchasesCents,
  };
}

export async function parseAmexStatement(buffer: ArrayBuffer | Buffer): Promise<AmexStatement> {
  return parseAmexItems(await extractPdfItems(buffer));
}

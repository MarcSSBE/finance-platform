/**
 * Date + money helpers for Amazon fee invoices (Project 3).
 *
 * Self-contained, matching the house convention (see invoices/dates.ts) so the
 * amazon module stays decoupled from income/ and ads-invoices/. Amazon EU VAT
 * invoices print dates as DD/MM/YYYY (e.g. "31/07/2026"), unlike TikTok's
 * "June 01, 2026", so this parser leads with the numeric format.
 */

export const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

export interface SimpleDate {
  y: number;
  m: number; // 0-11
  d: number;
  iso: string;
  ordinalMs: number;
}

function build(y: number, m: number, d: number): SimpleDate {
  const ordinalMs = Date.UTC(y, m, d);
  const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { y, m, d, iso, ordinalMs };
}

/**
 * Parse an Amazon invoice date. Handles "31/07/2026" (DD/MM/YYYY, the format
 * these invoices use) first, then falls back to the textual forms in case a
 * marketplace prints them differently. Returns null if unrecognized.
 */
export function parseAmazonDate(input: string): SimpleDate | null {
  const s = input.trim();

  // "DD/MM/YYYY" or "DD-MM-YYYY" or "DD.MM.YYYY"
  let m = s.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const y = Number(m[3]);
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) return build(y, mo, d);
  }

  // "Month DD, YYYY"
  m = s.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mo >= 0) return build(Number(m[3]), mo, Number(m[2]));
  }

  // "DD Month YYYY"
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3,}),?\s*(\d{4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mo >= 0) return build(Number(m[3]), mo, Number(m[1]));
  }

  return null;
}

/**
 * Parse a printed money amount into integer cents. Handles both "1,234.56"
 * (period decimal) and "1.234,56" / "1 234,56" (comma decimal) by treating the
 * LAST separator as the decimal point. Deterministic — no LLM ever does this.
 */
export function parseMoneyToCents(raw: string): number | null {
  let s = raw.trim().replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const negative = s.includes("-");
  s = s.replace(/-/g, "");

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let intPart: string;
  let fracPart: string;

  if (lastDot === -1 && lastComma === -1) {
    intPart = s;
    fracPart = "";
  } else {
    const decimalPos = Math.max(lastDot, lastComma);
    intPart = s.slice(0, decimalPos).replace(/[.,]/g, "");
    fracPart = s.slice(decimalPos + 1).replace(/[.,]/g, "");
  }

  fracPart = (fracPart + "00").slice(0, 2);
  const cents = (parseInt(intPart || "0", 10) || 0) * 100 + (parseInt(fracPart || "0", 10) || 0);
  return negative ? -cents : cents;
}

/** Format integer cents as "18.10" / "1,234.56" (period decimal, grouped). */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

/** "Jul" (capitalized 3-letter month). */
export function monthShortCap(m: number): string {
  const s = MONTHS[m];
  return s.charAt(0).toUpperCase() + s.slice(1);
}

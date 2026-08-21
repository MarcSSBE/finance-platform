/** Date + money helpers for invoice naming. Self-contained so the invoices
 *  module stays decoupled from the income module. */

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

/** Parse "June 01, 2026" or "29 Jun, 2026" (either order). Returns null if unrecognized. */
export function parseFlexibleDate(input: string): SimpleDate | null {
  const s = input.trim();

  // "Month DD, YYYY"
  let m = s.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (month >= 0) return build(Number(m[3]), month, Number(m[2]));
  }

  // "DD Month, YYYY"
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3,}),?\s*(\d{4})/);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (month >= 0) return build(Number(m[3]), month, Number(m[1]));
  }

  return null;
}

function build(y: number, m: number, d: number): SimpleDate {
  const ordinalMs = Date.UTC(y, m, d);
  const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { y, m, d, iso, ordinalMs };
}

export function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso + "T00:00:00Z");
  const b = Date.parse(bIso + "T00:00:00Z");
  return Math.abs(a - b) / 86_400_000;
}

/** Format integer cents as "160.83" / "500.00" (period decimal, grouped). */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

/** "Jun" (capitalized 3-letter). */
export function monthShortCap(m: number): string {
  const s = MONTHS[m];
  return s.charAt(0).toUpperCase() + s.slice(1);
}

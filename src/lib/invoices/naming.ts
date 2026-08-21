import { formatCents, monthShortCap, MONTHS, type SimpleDate } from "./dates";

/**
 * Filename convention (confirmed with Veronica):
 *   Tiktok $<amount> <DD mon-YY> BE
 * e.g. "Tiktok $160.83 01 jun-26 BE.pdf" — exact cents, period decimal, invoice date.
 */
export function buildInvoiceName(cents: number, date: SimpleDate, company = "BE"): string {
  const amount = `$${formatCents(cents)}`;
  const dd = String(date.d).padStart(2, "0");
  const mon = MONTHS[date.m];
  const yy = String(date.y).slice(2);
  return `Tiktok ${amount} ${dd} ${mon}-${yy} ${company}.pdf`;
}

/**
 * Drive folder for an invoice, keyed by its month:
 *   Accounting/06. Jun 2026/Tiktok
 */
export function buildDrivePath(date: SimpleDate): string {
  const nn = String(date.m + 1).padStart(2, "0");
  return `Accounting/${nn}. ${monthShortCap(date.m)} ${date.y}/Tiktok`;
}

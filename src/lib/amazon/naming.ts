import { formatCents, monthShortCap, MONTHS, type SimpleDate } from "./dates";
import type { AmazonInvoice } from "./types";

/**
 * Marketplace country code -> readable country name, used in the filename.
 * We spell the country out ("Belgium") instead of using the 2-letter code so it
 * never collides with the "BE" company suffix (Burman Enterprise).
 */
export const COUNTRY_NAMES: Record<string, string> = {
  SE: "Sweden",
  DE: "Germany",
  FR: "France",
  BE: "Belgium",
  NL: "Netherlands",
  IT: "Italy",
  ES: "Spain",
  PL: "Poland",
  UK: "UK",
  IE: "Ireland",
  AT: "Austria",
};

/**
 * PROVISIONAL filename convention for Amazon fee invoices.
 *
 * Veronica has NOT yet confirmed her exact spec, so this mirrors the shape she
 * likes for TikTok ("Tiktok $<amount> <DD mon-YY> BE") while staying unambiguous
 * for Amazon (currency code + spelled-out country, since Amazon spans many
 * marketplaces/currencies):
 *
 *   "Amazon <CUR> <total> <Country> <DD mon-YY> BE.pdf"
 *   e.g. "Amazon EUR 18.10 Belgium 31 jul-26 BE.pdf"
 *
 * This is the SINGLE place to change once she confirms the spec — nothing else
 * in the pipeline hardcodes a filename.
 */
export function buildAmazonName(inv: {
  currency: string;
  totalCents: number;
  country: string;
  date: SimpleDate;
  company?: string;
}): string {
  const company = inv.company ?? "BE";
  const amount = formatCents(inv.totalCents);
  const country = COUNTRY_NAMES[inv.country] ?? inv.country ?? "Unknown";
  const dd = String(inv.date.d).padStart(2, "0");
  const mon = MONTHS[inv.date.m];
  const yy = String(inv.date.y).slice(2);
  return `Amazon ${inv.currency} ${amount} ${country} ${dd} ${mon}-${yy} ${company}.pdf`;
}

/**
 * Drive folder for an Amazon invoice, keyed by its invoice month:
 *   Accounting/07. Jul 2026/Amazon
 *
 * The "Amazon" subfolder already exists in the Accounting structure. If Veronica
 * later wants per-country subfolders, that is a one-line change here (append
 * `/${COUNTRY_NAMES[country] ?? country}`).
 */
export function buildAmazonDrivePath(date: SimpleDate): string {
  const nn = String(date.m + 1).padStart(2, "0");
  return `Accounting/${nn}. ${monthShortCap(date.m)} ${date.y}/Amazon`;
}

/** Suffix a filename to avoid collisions within one Drive folder / zip. */
export function withCollisionSuffix(name: string, n: number): string {
  return name.replace(/\.pdf$/i, ` (${n}).pdf`);
}

/** Convenience: apply naming + path to a parsed invoice in place. */
export function applyNaming(inv: AmazonInvoice, date: SimpleDate): void {
  inv.proposedName = buildAmazonName({
    currency: inv.currency,
    totalCents: inv.totalCents,
    country: inv.country,
    date,
  });
  inv.drivePath = buildAmazonDrivePath(date);
}

import { formatCents, monthShortCap, type SimpleDate } from "./dates";
import type { AmazonDocType, AmazonInvoice } from "./types";

/**
 * Invoice-type word Veronica wants in the filename, one per document category.
 * These are her exact terms ("Fulfillment", "Merchant", "Fulfillment VAT credit",
 * "Merchant VAT credit", "EPR"). An unclassified doc contributes no type word.
 */
export const INVOICE_TYPE_LABELS: Record<AmazonDocType, string> = {
  "fba-tax-invoice": "Fulfillment",
  "merchant-vat-invoice": "Merchant",
  "fba-credit-note": "Fulfillment VAT credit",
  "merchant-credit-note": "Merchant VAT credit",
  "epr-service-invoice": "EPR",
  other: "",
};

/**
 * Filename convention for Amazon fee invoices, confirmed by Veronica (2026-09-21):
 *
 *   "Amazon <Country> <Type> <CUR> <total>.pdf"
 *   e.g. "Amazon FR Fulfillment VAT credit EUR 405.38.pdf"
 *        "Amazon BE Merchant EUR 18.10.pdf"
 *
 * Country is the 2-letter marketplace code (no collision worry now that there is
 * no "BE" company suffix). No date: the month lives in the Drive folder. This is
 * the SINGLE place that builds the name — nothing else hardcodes a filename.
 */
export function buildAmazonName(inv: {
  currency: string;
  totalCents: number;
  country: string;
  docType: AmazonDocType;
}): string {
  const amount = formatCents(inv.totalCents);
  const country = inv.country || "Unknown";
  const typeLabel = INVOICE_TYPE_LABELS[inv.docType] ?? "";
  const parts = ["Amazon", country, typeLabel, inv.currency, amount].filter(Boolean);
  return `${parts.join(" ")}.pdf`;
}

/**
 * Drive folder for an Amazon invoice: month, then a per-country subfolder, per
 * Veronica's request (2026-09-21) that each invoice land in e.g.
 *   Accounting/08. Aug 2026/Amazon/FR
 *
 * The "Amazon" folder already exists; the country subfolder is auto-created by
 * the shared Drive filer (it find-or-creates every path segment).
 */
export function buildAmazonDrivePath(date: SimpleDate, country: string): string {
  const nn = String(date.m + 1).padStart(2, "0");
  const cc = country || "Unknown";
  return `Accounting/${nn}. ${monthShortCap(date.m)} ${date.y}/Amazon/${cc}`;
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
    docType: inv.docType,
  });
  inv.drivePath = buildAmazonDrivePath(date, inv.country);
}

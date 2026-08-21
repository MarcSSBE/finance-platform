/**
 * Types for the Ads Invoice Automation feature (Project 2).
 * Amounts are integer cents; dates are ISO "yyyy-mm-dd" strings.
 */

/** A TIKTOK ADS payment line read from the WorldFirst statement. */
export interface Payment {
  dateISO: string;
  cents: number;
  raw: string;
}

export interface StatementResult {
  period: string;
  payments: Payment[];
  source: "text" | "ai";
}

/** A parsed TikTok invoice PDF plus its computed filing name and Drive path. */
export interface Invoice {
  fileName: string;
  invoiceNumber: string;
  client: string;
  company: string; // "BE"
  dateISO: string;
  cents: number;
  /** Proposed filename, e.g. "Tiktok $160.83 01 jun-26 BE.pdf". */
  proposedName: string;
  /** Target Drive folder, e.g. "Accounting/06. Jun 2026/Tiktok". */
  drivePath: string;
  /** How the fields were read: deterministic text layer, or the AI fallback. */
  source: "text" | "ai";
  /** True when a human should confirm before trusting/filing (AI-read values). */
  needsReview: boolean;
  /** Set when the PDF could not be parsed. */
  error?: string;
}

export interface InvoiceMatch {
  invoice: Invoice;
  payment: Payment;
  dayDiff: number;
}

export interface Reconciliation {
  toleranceDays: number;
  matched: InvoiceMatch[];
  invoicesWithoutPayment: Invoice[];
  paymentsWithoutInvoice: Payment[];
  invoiceTotalCents: number;
  paymentTotalCents: number;
  /** Invoices that failed to parse (surfaced, not silently dropped). */
  unreadable: Invoice[];
}

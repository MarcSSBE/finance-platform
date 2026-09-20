/**
 * Types for the Amazon seller-fee invoice feature (Project 3).
 *
 * These are the VAT documents Amazon issues to Burman Enterprise for Amazon's
 * OWN fees (selling/referral fees, FBA fees, credit notes, EPR), downloaded from
 * the Seller Central "Tax Document Library". Amounts are integer cents; dates are
 * ISO "yyyy-mm-dd". As with every module here, all money is parsed by
 * deterministic code, never by the LLM.
 */

/** The Seller Central document categories (from the Tax Document Library). */
export type AmazonDocType =
  | "merchant-vat-invoice" // selling/referral/subscription fees
  | "fba-tax-invoice" // Fulfillment by Amazon fees
  | "tax-credit-note" // refunds/credits
  | "epr-service-invoice" // EPR "pay on behalf" service
  | "other";

/** One parsed Amazon fee invoice plus its proposed filing name + Drive path. */
export interface AmazonInvoice {
  fileName: string;
  invoiceNumber: string;
  docType: AmazonDocType;
  /** Marketplace country code, e.g. "BE", "DE", "FR", "SE". */
  country: string;
  /** Marketplace domain as printed, e.g. "Amazon.com.be". */
  marketplace: string;
  /** Seller (Burman Enterprise AB) and Amazon supplier entity. */
  seller: string;
  supplier: string;
  /** Invoice date (drives the filing month). */
  dateISO: string;
  periodStartISO?: string;
  periodEndISO?: string;
  /** Invoice currency code, e.g. "EUR". */
  currency: string;
  /** Net (ex-VAT), VAT, and grand total (incl. VAT) in integer cents. */
  netCents: number;
  vatCents: number;
  totalCents: number;
  /** Grand total converted to the seller's home currency (SEK), if the invoice
   *  prints one, with the exchange rate used. Purely informational. */
  homeCurrency?: string;
  homeTotalCents?: number;
  exchangeRate?: number;
  /** Proposed filename, e.g. "Amazon EUR 18.10 Belgium 31 jul-26 BE.pdf". */
  proposedName: string;
  /** Target Drive folder, e.g. "Accounting/07. Jul 2026/Amazon". */
  drivePath: string;
  /** How the fields were read: deterministic text layer, or the AI fallback. */
  source: "text" | "ai";
  /** True when a human should confirm before trusting (AI-read values). */
  needsReview: boolean;
  /** Set when the PDF could not be parsed. */
  error?: string;
}

/** The result of processing an uploaded batch (individual PDFs and/or a ZIP). */
export interface AmazonBatchResult {
  invoices: AmazonInvoice[];
  /** Files that could not be read, surfaced rather than silently dropped. */
  unreadable: AmazonInvoice[];
  /** Deterministic totals per currency across the readable invoices. */
  totalsByCurrency: { currency: string; totalCents: number; count: number }[];
}

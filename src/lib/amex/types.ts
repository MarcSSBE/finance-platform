/**
 * Types for the Amex receipts feature (Project 4).
 *
 * The monthly American Express statement (SAS Amex Elite, Swedish layout) is
 * the source of truth for which receipts Veronica must have on file. Amounts are
 * integer cents; dates are ISO "yyyy-mm-dd". All money is parsed by
 * deterministic code, never by the LLM.
 */

export type AmexLineKind =
  | "purchase" // a card charge that needs a receipt
  | "payment" // "Betalning Mottagen, Tack" (card bill paid), no receipt
  | "card-fee" // Amex's own annual fee, the statement is the receipt
  | "credit"; // refund/credit on a purchase (CR)

/** One transaction row from the statement. */
export interface AmexLine {
  /** Transaktionsdatum: when the purchase happened (matches the receipt date). */
  dateISO: string;
  /** Processdatum: when Amex booked it. */
  processDateISO: string;
  /** Merchant text as printed, e.g. "Helium 10 Diamond Irvine". */
  description: string;
  /** Amount billed in SEK (includes the currency fee). Negative for payments/credits. */
  sekCents: number;
  /**
   * The amount in the currency actually charged. For foreign purchases this is
   * the figure on the merchant's receipt (e.g. USD 197.00), so receipts are
   * matched on this, NOT on the SEK amount. Equals SEK for domestic purchases.
   */
  originalCents: number;
  originalCurrency: string;
  /** Amex's currency-conversion fee in SEK ("Summa Avgifter"), 0 for SEK purchases. */
  feeSekCents: number;
  kind: AmexLineKind;
  /** True when a receipt should be on file for this line. */
  needsReceipt: boolean;
}

export interface AmexStatement {
  /** Fakturadatum. */
  statementDateISO: string;
  periodStartISO: string;
  periodEndISO: string;
  /** Last 5 digits as printed ("Kortnummer som slutar på"). */
  cardEnding: string;
  lines: AmexLine[];
  /** "Nya köp" total as printed on the statement. */
  printedPurchasesCents: number | null;
  /** Sum of the parsed purchase/fee/credit lines, computed in code. */
  parsedPurchasesCents: number;
  /** True when the parsed lines add up to the printed total (nothing missed). */
  totalsMatch: boolean;
}

/** A receipt known by its filename (her convention, see naming.ts). */
export interface AmexReceipt {
  fileName: string;
  vendor: string;
  cents: number;
  /** From the mark in the name ("$" → USD), null when the name has none. */
  currency: string | null;
  year: number;
  month: number; // 0-11
  day: number | null;
}

/** Why a match deserves a second look, while still counting as matched. */
export type AmexMatchNote =
  /** e.g. "Wispr AI $150" vs a SEK 150.00 charge: same number, different currency. */
  | "currency-differs";

export interface AmexMatch {
  /** Index into AmexStatement.lines. */
  lineIndex: number;
  receipt: AmexReceipt;
  /** Days between receipt and charge; null when the name only has a month. */
  dayDiff: number | null;
  notes: AmexMatchNote[];
}

export interface AmexReconciliation {
  toleranceDays: number;
  matched: AmexMatch[];
  /** Charges that need a receipt and have none (the ones to chase). */
  missing: number[];
  /** Receipts inside the statement period that fit no charge on it. */
  unmatchedReceipts: AmexReceipt[];
  /**
   * Receipts dated wholly outside the statement period (e.g. Sep 1-2 receipts
   * belong to the previous statement). Not an error, just not this statement's.
   */
  outsidePeriod: AmexReceipt[];
  /** Files whose name doesn't follow the pattern, so they could not be checked. */
  unreadableNames: string[];
  /**
   * Same amount and date window but a different vendor name: never auto-paired,
   * shown so a typo or trading name can be spotted. lineIndex → file names.
   */
  hints: { lineIndex: number; fileNames: string[] }[];
}

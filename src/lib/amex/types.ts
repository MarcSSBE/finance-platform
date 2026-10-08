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

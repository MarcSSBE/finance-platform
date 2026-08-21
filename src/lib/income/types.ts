/**
 * Shared types for the Income Summary feature (Project 1).
 *
 * The whole point of this feature is a TRUSTWORTHY total. Every figure here is
 * produced by deterministic code in `parse.ts` — never by an LLM. Amounts are
 * carried as integer cents to avoid floating-point drift and only formatted for
 * display at the edges.
 */

/** A single data row read from the WorldFirst export. */
export interface IncomeRow {
  /** 1-based row number in the source sheet (matches what Veronica sees in Excel). */
  rowNumber: number;
  /** Transaction type (column A), e.g. "Collection". */
  type: string;
  /** Description (column B), e.g. "Collection-TikTok Inc". */
  description: string;
  /** Currency code (column C), e.g. "USD". */
  currency: string;
  /** The raw cell text exactly as stored in the file (usually a string, not a number). */
  raw: string;
  /** Parsed amount in integer cents. */
  cents: number;
}

/** A row that could not be counted, with a plain-language reason. */
export interface SkippedRow {
  rowNumber: number;
  raw: string;
  reason: string;
}

/** Per-currency total (integer cents) plus how many rows contributed. */
export interface CurrencyTotal {
  currency: string;
  cents: number;
  count: number;
}

/** The complete, deterministic result of parsing one WorldFirst export. */
export interface IncomeSummary {
  fileName: string;
  /** The column letter used for amounts (default "D" = "Amount entered"). */
  amountColumn: string;
  /** The header text found for the amount column. */
  amountHeader: string;
  /** Whether the amount column was found by its expected header or inferred. */
  amountColumnInferred: boolean;
  /** Total number of data rows examined (excluding the header). */
  totalRows: number;
  /** Rows that were successfully counted. */
  rows: IncomeRow[];
  /** One total per currency (there is usually just one). */
  totalsByCurrency: CurrencyTotal[];
  /** Rows that were skipped (blank, non-numeric, etc.) — surfaced, never hidden. */
  skipped: SkippedRow[];
  /** Count of rows with a negative amount (refunds/reversals), for a heads-up. */
  negativeCount: number;
}

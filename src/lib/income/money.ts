/**
 * Deterministic money parsing and formatting.
 *
 * WorldFirst exports store amounts as TEXT (e.g. the cell type is inlineStr),
 * which is why Excel's SUM returns 0. We parse that text ourselves into integer
 * cents so the arithmetic is exact and auditable. No LLM ever touches these
 * values.
 */

export interface ParsedAmount {
  cents: number;
}

const WHITESPACE = /[\s   ]/g; // regular, non-breaking, narrow no-break, thin spaces

/**
 * Parse a raw cell value (string or number) into integer cents.
 * Returns null when the value is blank or not a recognizable number.
 *
 * Handles: plain "110.23", grouped "1,234.56", European "1.234,56" / "1 234,56",
 * bare integers, negatives ("-12.50" or "(12.50)").
 */
export function parseAmountToCents(value: unknown): ParsedAmount | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return { cents: Math.round(value * 100) };
  }

  let s = String(value).trim();
  if (s === "") return null;

  const negative = /^\(.*\)$/.test(s) || s.includes("-");
  s = s.replace(WHITESPACE, "");
  // Keep only digits and separators.
  s = s.replace(/[^0-9.,]/g, "");
  if (s === "" || !/[0-9]/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  let intPart: string;
  let fracPart: string;

  if (lastDot === -1 && lastComma === -1) {
    intPart = s;
    fracPart = "";
  } else {
    const decimalPos = Math.max(lastDot, lastComma);
    const sepChar = decimalPos === lastDot ? "." : ",";
    const otherSepPos = sepChar === "." ? lastComma : lastDot;
    const after = s.slice(decimalPos + 1);

    // Pure grouping like "1,234" or "1.234.567" — the last separator is NOT a decimal.
    const pureGrouping =
      after.length === 3 &&
      otherSepPos === -1 &&
      new RegExp(`^\\d{1,3}(\\${sepChar}\\d{3})+$`).test(s);

    if (pureGrouping) {
      intPart = s.replace(/[.,]/g, "");
      fracPart = "";
    } else {
      intPart = s.slice(0, decimalPos).replace(/[.,]/g, "");
      fracPart = after.replace(/[.,]/g, "");
    }
  }

  // Normalize the fractional part to exactly two digits (cents).
  fracPart = (fracPart + "00").slice(0, 2);

  const intValue = intPart === "" ? 0 : parseInt(intPart, 10);
  const fracValue = fracPart === "" ? 0 : parseInt(fracPart, 10);
  if (Number.isNaN(intValue) || Number.isNaN(fracValue)) return null;

  const cents = intValue * 100 + fracValue;
  return { cents: negative ? -cents : cents };
}

/** Format integer cents as a grouped decimal string, e.g. 361959 -> "3,619.59". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = whole.toLocaleString("en-US");
  return `${sign}${grouped}.${frac}`;
}

/** Format integer cents with an ISO currency code, e.g. "3,619.59 USD". */
export function formatMoney(cents: number, currency: string): string {
  return `${formatCents(cents)} ${currency}`.trim();
}

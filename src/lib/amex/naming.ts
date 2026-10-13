/**
 * Veronica's receipt filename convention (from her Amex folder, Aug 2026):
 *
 *   "Zendesk $115 aug-26.pdf"        whole amount, no ",00"
 *   "Twillio $90,10 aug-26.pdf"      comma decimal
 *   "TraceFuse $450 Aug16-26.pdf"    day added when the vendor repeats in the month
 *
 * `parseReceiptName` reads a name like that back into vendor / amount / month
 * (and day when present) so receipts can be matched against the statement
 * without opening the file. `buildReceiptName` writes the same pattern. Both
 * are deterministic; money never comes from the LLM.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Swedish/variant spellings she might type. */
const MONTH_ALIASES: Record<string, number> = {
  maj: 4,
  okt: 9,
  sept: 8,
  june: 5,
  july: 6,
};

/** Currency marks seen or expected in her names → ISO code. */
const CURRENCY_MARKS: [RegExp, string][] = [
  [/^\$|^usd$/i, "USD"],
  [/^€|^eur$/i, "EUR"],
  [/^£|^gbp$/i, "GBP"],
  [/^kr$|^sek$/i, "SEK"],
];

/** ISO code → the mark written in a filename. Only "$" is confirmed by Veronica. */
const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

export interface ParsedReceiptName {
  fileName: string;
  /** Vendor as she typed it, e.g. "Wispr AI". */
  vendor: string;
  cents: number;
  /** ISO code from the mark in the name, or null when the name has none. */
  currency: string | null;
  year: number;
  /** 0-11. */
  month: number;
  /** Day of month when the name carries one ("Aug16-26"), else null. */
  day: number | null;
}

function monthIndex(word: string): number | null {
  const w = word.toLowerCase();
  if (w in MONTH_ALIASES) return MONTH_ALIASES[w];
  const i = MONTHS.indexOf(w.slice(0, 3));
  return i >= 0 && (w.length === 3 || MONTHS[i] + w.slice(3) === w) ? i : null;
}

/**
 * Amount as she writes it → integer cents. A separator followed by exactly two
 * digits at the end is the decimal mark ("90,10", "90.10"); one followed by
 * three digits is a thousands separator ("1,000", "1.000"). Spaces are not
 * allowed inside an amount: "Helium 10 197" must not read as 10,197.
 */
export function parseNameAmount(s: string): number | null {
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const dec = s.match(/^(.*?)[.,](\d{2})$/);
  const whole = dec ? dec[1] : s;
  const frac = dec ? dec[2] : "00";
  // Remaining separators must be thousands groups.
  if (whole && !/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(whole)) return null;
  const digits = whole.replace(/[.,]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  return parseInt(digits, 10) * 100 + parseInt(frac, 10);
}

// 1 vendor, 2 mark, 3 amount, 4 mark, 5 day ("16 aug-26"), 6 month, 7 day ("Aug16-26"), 8 yy
const NAME_RE =
  /^(.+?)\s+(\$|€|£|USD|EUR|GBP|SEK)?\s*(\d(?:[\d.,]*\d)?)\s*(kr|SEK|USD|EUR|GBP|\$|€)?\s+(?:(\d{1,2})\s+)?([A-Za-zåäöÅÄÖ]{3,4})\s*(\d{1,2})?\s*-\s*(\d{2})$/i;

/** Read one of her filenames. Returns null when it doesn't follow the pattern. */
export function parseReceiptName(fileName: string): ParsedReceiptName | null {
  // Drop the extension and a download-duplicate suffix ("... aug-26 (1).pdf").
  const base = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/\s*\(\d+\)$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = base.match(NAME_RE);
  if (!m) return null;
  const g = {
    vendor: m[1], pre: m[2], amount: m[3], post: m[4],
    dayFirst: m[5], mon: m[6], day: m[7], yy: m[8],
  };
  const month = monthIndex(g.mon);
  const cents = parseNameAmount(g.amount);
  if (month === null || cents === null || cents === 0) return null;
  const mark = g.pre ?? g.post ?? "";
  const currency = mark ? (CURRENCY_MARKS.find(([re]) => re.test(mark))?.[1] ?? null) : null;
  const dayRaw = g.day ?? g.dayFirst;
  const day = dayRaw ? Number(dayRaw) : null;
  if (day !== null && (day < 1 || day > 31)) return null;
  return {
    fileName,
    vendor: g.vendor.trim(),
    cents,
    currency,
    year: 2000 + Number(g.yy),
    month,
    day,
  };
}

/** 9010 → "90,10"; 11500 → "115" (her style drops ",00"). */
export function formatNameAmount(cents: number): string {
  const whole = Math.trunc(Math.abs(cents) / 100);
  const frac = Math.abs(cents) % 100;
  return frac === 0 ? String(whole) : `${whole},${String(frac).padStart(2, "0")}`;
}

/**
 * Build a name in her pattern. `withDay` is for a vendor that appears more than
 * once in the month ("TraceFuse $450 Aug16-26"); note she capitalizes the month
 * only in that form, and this mirrors it exactly.
 */
export function buildReceiptName(r: {
  vendor: string;
  cents: number;
  currency: string;
  dateISO: string;
  withDay: boolean;
}): string {
  const [y, mo, d] = r.dateISO.split("-").map(Number);
  const mon = MONTHS[mo - 1];
  const yy = String(y).slice(2);
  const symbol = CURRENCY_SYMBOL[r.currency];
  const amount = symbol ? `${symbol}${formatNameAmount(r.cents)}` : `${r.currency} ${formatNameAmount(r.cents)}`;
  const when = r.withDay ? `${mon[0].toUpperCase()}${mon.slice(1)}${d}-${yy}` : `${mon}-${yy}`;
  return `${r.vendor} ${amount} ${when}.pdf`;
}

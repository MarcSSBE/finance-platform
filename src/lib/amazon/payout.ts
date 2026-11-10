/**
 * Amazon payout statements ("Payment statement", Seller Central > Payments > Statement View), Veronica 2026-11-10:
 * "It would be extremely helpful if the files could be named to include the payout amount and the country (since
 * the country isn't stated on the document itself, one currently has to infer it from the folder it's in)."
 *
 * Charlie saves them with "Microsoft: Print To PDF", which draws the letters as shapes: there is NO text layer, so
 * the figures can only be read from the page image (Claude). Nothing Claude reads is trusted on its own:
 *  - the section totals (beginning balance + sales + refunds + expenses ...) must add up to the net proceeds to the
 *    cent, and the transfer (if printed) must equal the net proceeds;
 *  - dates come back as ISO and must be real dates in order (settlement start <= end, transfer right after);
 *  - the currency must agree with the symbol as printed;
 *  - the country is NEVER read from the page: it comes from the folder ("Amazon/DE/Statement View.pdf").
 * Anything that fails a check is returned as unreadable (with the reason), never with a guessed name.
 */
import { z } from "zod";
import { extractStructured } from "@/lib/ai/claude";
import type { SimpleDate } from "./dates";
import { applyNaming } from "./naming";
import type { AmazonInvoice } from "./types";

/** Marketplace country folders (2 letters). "UK" is kept as written: it is what the folders are called. */
const COUNTRY_FOLDERS = new Set([
  "AE", "AU", "BE", "BR", "CA", "DE", "EG", "ES", "FR", "GB", "IE", "IN", "IT", "JP", "MX", "NL", "PL", "SA", "SE",
  "SG", "TR", "UK", "US", "ZA",
]);

/** Country from the nearest folder that is a 2-letter marketplace code ("x/Amazon/DE/Statement View.pdf" -> "DE"). */
export function countryFromPath(path: string): string {
  const folders = path.replace(/\\/g, "/").split("/").slice(0, -1).reverse();
  for (const f of folders) {
    const c = f.trim().toUpperCase();
    if (COUNTRY_FOLDERS.has(c)) return c;
  }
  return "";
}

/** A text layer that says "Payment statement" + "Net Proceeds" or "Settlement Period" (when one exists). */
export function looksLikePayoutText(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("payment statement") && (t.includes("net proceeds") || t.includes("settlement period"));
}

const SYMBOL_CURRENCY: Record<string, string> = { "€": "EUR", "£": "GBP", "¥": "JPY", "zł": "PLN" };
const DOLLAR_BY_COUNTRY: Record<string, string> = { US: "USD", CA: "CAD", MX: "MXN", AU: "AUD", SG: "SGD" };

/** ISO currency from what is printed: a code ("EUR") wins; "€"/"£" map directly; "$" needs the country. */
export function resolveCurrency(printed: string, country: string): string {
  const p = printed.trim();
  if (/^[A-Z]{3}$/.test(p)) return p;
  if (SYMBOL_CURRENCY[p]) return SYMBOL_CURRENCY[p];
  if (p === "kr") return country === "SE" ? "SEK" : "";
  if (p === "$" || p === "US$") return DOLLAR_BY_COUNTRY[country] ?? "";
  return "";
}

/** "2026-10-12" -> SimpleDate, only if it is a real calendar date. */
export function isoToSimpleDate(iso: string): SimpleDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const ordinalMs = Date.UTC(y, mo, d);
  const back = new Date(ordinalMs);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo || back.getUTCDate() !== d) return null;
  return { y, m: mo, d, iso: `${m[1]}-${m[2]}-${m[3]}`, ordinalMs };
}

const DAY = 86_400_000;
const cents = (n: number) => Math.round(n * 100);

export const payoutSchema = z.object({
  kind: z.enum(["payment-statement", "fee-invoice", "other"]),
  currencyAsPrinted: z.string().optional().default(""),
  settlementStart: z.string().optional().default(""),
  settlementEnd: z.string().optional().default(""),
  sections: z.array(z.object({ name: z.string(), amount: z.number() })).optional().default([]),
  netProceeds: z.number().optional(),
  transferAmount: z.number().optional(),
  transferDate: z.string().optional().default(""),
});
export type PayoutRead = z.infer<typeof payoutSchema>;

/** The checks, in plain code, on what was read. Returns the reason it fails, or null when everything agrees. */
export function payoutProblem(r: PayoutRead): string | null {
  if (r.kind !== "payment-statement") return "Not a payout statement.";
  if (r.netProceeds === undefined) return "No net proceeds found.";
  if (r.sections.length < 2) return "The statement sections were not read.";
  const sum = r.sections.reduce((n, s) => n + cents(s.amount), 0);
  if (sum !== cents(r.netProceeds)) return "The sections do not add up to the net proceeds.";
  if (r.transferAmount !== undefined && cents(r.transferAmount) !== cents(r.netProceeds))
    return "The transfer amount differs from the net proceeds.";
  const start = isoToSimpleDate(r.settlementStart), end = isoToSimpleDate(r.settlementEnd);
  if (!start || !end || start.ordinalMs > end.ordinalMs || end.ordinalMs - start.ordinalMs > 92 * DAY)
    return "The settlement period could not be read.";
  if (r.transferDate) {
    const tr = isoToSimpleDate(r.transferDate);
    if (!tr || tr.ordinalMs < end.ordinalMs - 3 * DAY || tr.ordinalMs > end.ordinalMs + 14 * DAY)
      return "The transfer date does not fit the settlement period.";
  }
  return null;
}

/** Build the filed document from a read that passed payoutProblem(). Country from the folder only. */
export function payoutToInvoice(r: PayoutRead, fileName: string, path: string): AmazonInvoice {
  const country = countryFromPath(path);
  const currency = resolveCurrency(r.currencyAsPrinted, country);
  const end = isoToSimpleDate(r.settlementEnd)!;
  const filedOn = (r.transferDate && isoToSimpleDate(r.transferDate)) || end;
  const amount = cents(r.transferAmount ?? r.netProceeds!);
  const inv: AmazonInvoice = {
    fileName,
    invoiceNumber: "",
    docType: "payment-statement",
    country,
    marketplace: "",
    seller: "",
    supplier: "Amazon",
    dateISO: filedOn.iso,
    periodStartISO: isoToSimpleDate(r.settlementStart)!.iso,
    periodEndISO: end.iso,
    transferDateISO: r.transferDate ? filedOn.iso : undefined,
    currency,
    netCents: amount,
    vatCents: 0,
    totalCents: amount,
    proposedName: "",
    drivePath: "",
    source: "ai",
    needsReview: true, // read from the page image: a person confirms, even though the sums agree
  };
  if (!country) inv.error = "No country folder (upload the ZIP of the Amazon folder, e.g. Amazon/DE/...).";
  else if (!currency) inv.error = `Currency "${r.currencyAsPrinted}" not recognised for ${country}.`;
  if (!inv.error) applyNaming(inv, filedOn);
  return inv;
}

export const PAYOUT_PROMPT =
  "Look at this Amazon document. If it is an Amazon seller PAYMENT STATEMENT (title 'Payment statement', with a " +
  "settlement period, section totals and 'Net Proceeds'), record it; if it is an Amazon fee/VAT invoice or credit " +
  "note, set kind to 'fee-invoice'; otherwise 'other'. For a payment statement: currencyAsPrinted = the currency " +
  "exactly as printed next to the amounts (e.g. '€', '£', '$' or a 3-letter code). sections = ONLY the top-level " +
  "section totals listed between the start and 'Net Proceeds', in order, including 'Beginning balance' and any " +
  "other top-level line (e.g. 'Sales', 'Refunds', 'Expenses', 'Account level reserve'); never the indented sub-lines. " +
  "Amounts as numbers with their sign (a printed minus or brackets = negative). netProceeds = the 'Net Proceeds' " +
  "total. transferAmount and transferDate = from the sentence 'A transfer was made to your bank account ... in the " +
  "amount of ... on ...', if present. Dates as YYYY-MM-DD; amazon.de/.fr/.it/.es/.co.uk/.nl/.se/.pl print " +
  "DD/MM/YYYY, amazon.com prints MM/DD/YYYY. Copy the figures exactly; do not calculate or round.";

const JSON_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["payment-statement", "fee-invoice", "other"] },
    currencyAsPrinted: { type: "string" },
    settlementStart: { type: "string", description: "YYYY-MM-DD" },
    settlementEnd: { type: "string", description: "YYYY-MM-DD" },
    sections: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, amount: { type: "number" } }, required: ["name", "amount"] },
    },
    netProceeds: { type: "number" },
    transferAmount: { type: "number" },
    transferDate: { type: "string", description: "YYYY-MM-DD" },
  },
  required: ["kind"],
};

// At most 4 page reads at once: a whole folder uploaded together must not hit the API rate limit (a failed read
// is reported as unreadable, but it should not happen just because the batch was big).
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 4) await new Promise<void>((res) => waiting.push(res));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Ask Claude to read the page. null = AI unavailable or the answer did not validate against the schema. */
async function readPayoutWithAi(buffer: ArrayBuffer | Buffer): Promise<PayoutRead | null> {
  return limited(() => readOnce(buffer));
}

async function readOnce(buffer: ArrayBuffer | Buffer): Promise<PayoutRead | null> {
  const pdfBase64 = Buffer.from(buffer instanceof Uint8Array ? buffer : Buffer.from(buffer as ArrayBuffer)).toString("base64");
  return extractStructured({
    pdfBase64,
    toolName: "record_amazon_document",
    toolDescription: "Record what kind of Amazon document this is and, for a payment statement, its figures.",
    prompt: PAYOUT_PROMPT,
    jsonSchema: JSON_SCHEMA,
    schema: payoutSchema,
    maxTokens: 1500,
  });
}

/**
 * One document through the AI read + the code checks. kind "fee-invoice" is returned as null so the caller keeps
 * the existing fee-invoice AI fallback; everything else becomes a payout (named) or an unreadable entry (reason).
 */
export async function classifyAndReadPayout(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
  path: string,
  base: AmazonInvoice,
  read: (b: ArrayBuffer | Buffer) => Promise<PayoutRead | null> = readPayoutWithAi,
): Promise<AmazonInvoice | "fee-invoice" | null> {
  const r = await read(buffer);
  if (!r) return null;
  if (r.kind === "fee-invoice") return "fee-invoice";
  if (r.kind === "other") return { ...base, error: "Not an Amazon fee invoice or payout statement." };
  const problem = payoutProblem(r);
  if (problem) return { ...base, docType: "payment-statement", error: `Payout statement: ${problem}` };
  return payoutToInvoice(r, fileName, path);
}

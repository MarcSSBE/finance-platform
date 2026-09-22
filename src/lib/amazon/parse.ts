/**
 * Deterministic parser for Amazon seller-fee VAT invoices (Project 3).
 *
 * These PDFs carry a clean text layer (verified on a real Belgium invoice), so
 * the fields are read in plain code and the money is parsed to integer cents by
 * code, never by the LLM. Claude is only a FALLBACK for a PDF whose text layer
 * is missing/garbled (scanned or reformatted), and anything it reads is flagged
 * needsReview. The invoices are multilingual (NL/FR/DE/...), so the regexes are
 * anchored on stable numeric shapes and currency codes rather than one language.
 */
import { z } from "zod";
import { extractPdfText } from "@/lib/pdf"; // shared, project-agnostic PDF text extractor
import { parseAmazonDate, parseMoneyToCents } from "./dates";
import { applyNaming } from "./naming";
import { extractStructured, isAiEnabled } from "@/lib/ai/claude";
import type { AmazonDocType, AmazonInvoice } from "./types";

/** Amazon invoice ids look like "SE-AEU-2026-33639" or "SE-CN-AEU-2026-7899". */
const INVOICE_NUMBER_RE = /\b([A-Z]{2}-(?:CN-)?[A-Z]{2,4}-\d{4}-\d{3,})\b/;

/** Map an Amazon marketplace domain suffix to a 2-letter country code. */
function countryFromMarketplace(text: string): { country: string; marketplace: string } {
  const m = text.match(/Amazon\.((?:com|co)\.[a-z]{2}|[a-z]{2,3})\b/i);
  if (!m) return { country: "", marketplace: "" };
  const suffix = m[1].toLowerCase();
  const code = suffix.split(".").pop()!.toUpperCase(); // "com.be" -> "BE", "de" -> "DE"
  return { country: code, marketplace: `Amazon.${m[1]}` };
}

/**
 * Classify the document from language-agnostic keywords. Amazon issues five kinds
 * Veronica names distinctly: fulfillment (FBA) fee invoice, merchant (selling) fee
 * invoice, credit notes against each of those, and the EPR service invoice. A
 * credit note still names the fee it credits, so we detect "is this a credit note"
 * and "is this fulfillment vs merchant" independently and compose the two.
 */
export function detectDocType(text: string): AmazonDocType {
  const t = text.toLowerCase();

  const isEpr = /\bepr\b|pay on behalf|betaling namens|paiement pour le compte/.test(t);
  if (isEpr) return "epr-service-invoice";

  const isCredit =
    /credit\s*note|creditnota|note de cr|nota de cr|gutschrift|nota di credito|kreditnota/.test(t);
  const isFba =
    /fulfillment by amazon|logistiek door amazon|exp[eé]di[eé] par amazon|versand durch amazon|gesti[oó]n log[ií]stica|gestione da parte di amazon/.test(t);
  const isMerchant =
    /verkopen via amazon|vente sur amazon|selling on amazon|verkauf(?:en)? (?:bei|über) amazon|venta en amazon|vendita su amazon/.test(t);

  if (isCredit) {
    // Default an ambiguous credit note to merchant (the common case); a
    // fulfillment credit says so explicitly.
    return isFba ? "fba-credit-note" : "merchant-credit-note";
  }
  if (isFba) return "fba-tax-invoice";
  if (isMerchant) return "merchant-vat-invoice";
  return "other";
}

/** Pull the net / VAT / grand-total from the totals row (currency + up to 3 amounts). */
function parseTotals(text: string): { currency: string; net: number; vat: number; total: number } | null {
  const row = text.match(
    /(?:Totaal|Total|Totale|Gesamtbetrag|Gesamt|Suma|Totalt|Toplam|Totale complessivo)\s+((?:[A-Z]{3}\s*[\d.,]+\s*){1,3})/i,
  );
  if (!row) return null;
  const amounts = [...row[1].matchAll(/([A-Z]{3})\s*([\d.,]+)/g)];
  if (amounts.length === 0) return null;
  const currency = amounts[0][1].toUpperCase();
  const cents = amounts.map((a) => parseMoneyToCents(a[2]) ?? 0);

  if (cents.length >= 3) return { currency, net: cents[0], vat: cents[1], total: cents[2] };
  if (cents.length === 2) return { currency, net: cents[0], vat: cents[1] - cents[0], total: cents[1] };
  return { currency, net: cents[0], vat: 0, total: cents[0] };
}

export async function parseAmazonInvoice(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
): Promise<AmazonInvoice> {
  const base: AmazonInvoice = {
    fileName,
    invoiceNumber: "",
    docType: "other",
    country: "",
    marketplace: "",
    seller: "",
    supplier: "",
    dateISO: "",
    currency: "",
    netCents: 0,
    vatCents: 0,
    totalCents: 0,
    proposedName: "",
    drivePath: "",
    source: "text",
    needsReview: false,
  };

  try {
    const text = await extractPdfText(buffer);

    const invoiceNumber = text.match(INVOICE_NUMBER_RE)?.[1] ?? "";
    const { country, marketplace } = countryFromMarketplace(text);
    const docType = detectDocType(text);

    // First DD/MM/YYYY in the doc is the invoice date; the "X to Y" pair is the period.
    const firstDate = text.match(/\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}\b/)?.[0] ?? "";
    const periodMatch = text.match(
      /(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})\s*(?:to|t\/m|à|au|bis|a|hasta|fino al|-)\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})/i,
    );
    const date = parseAmazonDate(firstDate);

    const totals = parseTotals(text);

    // Home-currency (e.g. SEK) equivalent + exchange rate, if printed. Informational.
    const fx = text.match(/\[\s*([\d.,]+)\s*([A-Z]{3})\s*\/\s*1\s*([A-Z]{3})\s*\]/);
    let homeCurrency: string | undefined;
    let homeTotalCents: number | undefined;
    let exchangeRate: number | undefined;
    if (fx) {
      exchangeRate = Number(fx[1].replace(/,/g, ""));
      homeCurrency = fx[2].toUpperCase();
      const homeAmt = text.match(new RegExp(`\\b${homeCurrency}\\s+([\\d.,]+)`));
      if (homeAmt) homeTotalCents = parseMoneyToCents(homeAmt[1]) ?? undefined;
    }

    const seller = text.match(/Burman Enterprise AB/)?.[0] ?? "";
    const supplier = text.match(/Amazon EU S\.à r\.l\.[^\n]*/)?.[0]?.trim() ?? "Amazon EU S.à r.l.";

    if (date && totals) {
      const inv: AmazonInvoice = {
        ...base,
        invoiceNumber,
        docType,
        country,
        marketplace,
        seller: seller || "Burman Enterprise AB",
        supplier,
        dateISO: date.iso,
        periodStartISO: periodMatch ? parseAmazonDate(periodMatch[1])?.iso : undefined,
        periodEndISO: periodMatch ? parseAmazonDate(periodMatch[2])?.iso : undefined,
        currency: totals.currency,
        netCents: totals.net,
        vatCents: totals.vat,
        totalCents: totals.total,
        homeCurrency,
        homeTotalCents,
        exchangeRate,
      };
      applyNaming(inv, date);
      return inv;
    }

    // Fallback: text layer missing a field (scanned or reformatted invoice).
    if (isAiEnabled()) {
      const ai = await aiExtractInvoice(buffer, fileName);
      if (ai) return ai;
    }
    return { ...base, invoiceNumber, country, marketplace, docType, error: "Could not read the date or total." };
  } catch {
    if (isAiEnabled()) {
      const ai = await aiExtractInvoice(buffer, fileName);
      if (ai) return ai;
    }
    return { ...base, error: "Could not read this PDF." };
  }
}

const aiSchema = z.object({
  invoiceNumber: z.string().optional().default(""),
  invoiceDate: z.string(),
  marketplace: z.string().optional().default(""),
  countryCode: z.string().optional().default(""),
  currency: z.string(),
  net: z.number().optional().default(0),
  vat: z.number().optional().default(0),
  total: z.number(),
});

/** AI fallback for one invoice. Always flagged needsReview; a human confirms
 *  any AI-read figure before it is trusted. Returns null on failure. */
async function aiExtractInvoice(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
): Promise<AmazonInvoice | null> {
  const pdfBase64 = Buffer.from(
    buffer instanceof Uint8Array ? buffer : Buffer.from(buffer as ArrayBuffer),
  ).toString("base64");

  const result = await extractStructured({
    pdfBase64,
    toolName: "record_amazon_invoice",
    toolDescription: "Record the key fields from this Amazon VAT/fee invoice.",
    prompt:
      "This is an Amazon seller-fee VAT invoice (it may be in Dutch, French, German, etc.). " +
      "Record the invoice number, invoice date, the marketplace domain (e.g. Amazon.com.be) and " +
      "its country code, the currency, and the net, VAT, and grand total amounts. Use the grand " +
      "total including VAT, not any home-currency conversion.",
    jsonSchema: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string" },
        invoiceDate: { type: "string", description: "e.g. '31/07/2026'" },
        marketplace: { type: "string", description: "e.g. 'Amazon.com.be'" },
        countryCode: { type: "string", description: "2-letter marketplace country, e.g. 'BE'" },
        currency: { type: "string", description: "e.g. 'EUR'" },
        net: { type: "number", description: "net amount excluding VAT" },
        vat: { type: "number", description: "VAT amount" },
        total: { type: "number", description: "grand total including VAT" },
      },
      required: ["invoiceDate", "currency", "total"],
    },
    schema: aiSchema,
  });
  if (!result) return null;

  const date = parseAmazonDate(result.invoiceDate);
  if (!date) return null;

  const inv: AmazonInvoice = {
    fileName,
    invoiceNumber: result.invoiceNumber,
    docType: "other",
    country: result.countryCode.toUpperCase(),
    marketplace: result.marketplace,
    seller: "Burman Enterprise AB",
    supplier: "Amazon EU S.à r.l.",
    dateISO: date.iso,
    currency: result.currency.toUpperCase(),
    netCents: Math.round(result.net * 100),
    vatCents: Math.round(result.vat * 100),
    totalCents: Math.round(result.total * 100),
    proposedName: "",
    drivePath: "",
    source: "ai",
    needsReview: true,
  };
  applyNaming(inv, date);
  return inv;
}

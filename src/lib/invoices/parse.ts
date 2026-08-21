import { z } from "zod";
import { extractPdfText } from "./pdf";
import { parseFlexibleDate } from "./dates";
import { buildDrivePath, buildInvoiceName } from "./naming";
import { extractStructured, isAiEnabled } from "@/lib/ai/claude";
import type { Invoice, Payment, StatementResult } from "./types";

/** Turn a "1,234.56" style string into integer cents. */
function toCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const [whole, frac = "0"] = cleaned.split(".");
  return parseInt(whole || "0", 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
}

/**
 * Parse a WorldFirst statement PDF into its TIKTOK ADS payment lines.
 * Each block looks like:
 *   "29 Jun, 2026 TIKTOK ADS CULVER CITY ... <ids> 500.00 USD 45862.91 USD"
 * where the first amount is the payment (OUT) and the second is the running balance.
 */
export async function parseStatement(
  buffer: ArrayBuffer | Buffer,
): Promise<StatementResult> {
  const text = await extractPdfText(buffer);

  const periodMatch = text.match(/Transactions time\s*:?\s*(.+)/i);
  const period = periodMatch ? periodMatch[1].trim() : "";

  const payments: Payment[] = [];
  const re =
    /(\d{1,2}\s+[A-Za-z]{3,},?\s*\d{4})\s+TIKTOK ADS[\s\S]*?([\d,]+\.\d{2})\s*USD\s+[\d,]+\.\d{2}\s*USD/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const date = parseFlexibleDate(m[1]);
    if (!date) continue;
    payments.push({ dateISO: date.iso, cents: toCents(m[2]), raw: m[2] });
  }

  // Fallback: if the deterministic pass found nothing (scanned or reformatted
  // statement) and a key is present, let Claude read the ad-payment lines.
  if (payments.length === 0 && isAiEnabled()) {
    const ai = await aiExtractStatement(buffer);
    if (ai && ai.length > 0) {
      return { period, payments: ai, source: "ai" };
    }
  }

  return { period, payments, source: "text" };
}

const aiPaymentsSchema = z.object({
  payments: z.array(
    z.object({
      date: z.string(),
      amountUsd: z.number(),
    }),
  ),
});

async function aiExtractStatement(buffer: ArrayBuffer | Buffer): Promise<Payment[] | null> {
  const pdfBase64 = Buffer.from(
    buffer instanceof Uint8Array ? buffer : Buffer.from(buffer as ArrayBuffer),
  ).toString("base64");

  const result = await extractStructured({
    pdfBase64,
    toolName: "record_ad_payments",
    toolDescription: "Record every TIKTOK ADS payment (the OUT column) from this WorldFirst statement.",
    prompt:
      "This is a WorldFirst account statement. List every TIKTOK ADS payment: its date and the amount that went OUT (not the running balance). Ignore income/collection lines.",
    jsonSchema: {
      type: "object",
      properties: {
        payments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "Payment date, e.g. '29 Jun, 2026'" },
              amountUsd: { type: "number", description: "OUT amount in USD" },
            },
            required: ["date", "amountUsd"],
          },
        },
      },
      required: ["payments"],
    },
    schema: aiPaymentsSchema,
  });
  if (!result) return null;

  const payments: Payment[] = [];
  for (const p of result.payments) {
    const date = parseFlexibleDate(p.date);
    if (!date) continue;
    payments.push({ dateISO: date.iso, cents: Math.round(p.amountUsd * 100), raw: String(p.amountUsd) });
  }
  return payments;
}

/**
 * Parse a single TikTok invoice PDF into its fields plus the proposed filing
 * name and Drive path. On failure, returns an Invoice with an `error` set.
 */
export async function parseInvoice(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
): Promise<Invoice> {
  const base: Invoice = {
    fileName,
    invoiceNumber: "",
    client: "",
    company: "BE",
    dateISO: "",
    cents: 0,
    proposedName: "",
    drivePath: "",
    source: "text",
    needsReview: false,
  };

  try {
    const text = await extractPdfText(buffer);

    const invoiceNumber = text.match(/Invoice #\s*(\S+)/i)?.[1] ?? "";
    const client = text.match(/Client Name\s+(.+?)\s+Invoice #/i)?.[1]?.trim() ?? "";
    const dateStr = text.match(/Invoice Date\s+([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i)?.[1] ?? "";

    // The grand total is the last "Total <amount>" (Subtotal/lowercase never matches).
    const totals = [...text.matchAll(/\bTotal\s+([\d,]+\.\d{2})/g)];
    const totalStr = totals.length ? totals[totals.length - 1][1] : "";

    const date = parseFlexibleDate(dateStr);
    if (date && totalStr) {
      const cents = toCents(totalStr);
      return {
        ...base,
        invoiceNumber,
        client: client || "Burman Enterprise AB",
        dateISO: date.iso,
        cents,
        proposedName: buildInvoiceName(cents, date),
        drivePath: buildDrivePath(date),
      };
    }

    // Fallback: text layer missing a field (scanned or reformatted invoice).
    if (isAiEnabled()) {
      const ai = await aiExtractInvoice(buffer, fileName);
      if (ai) return ai;
    }

    return { ...base, invoiceNumber, client, error: "Could not read the date or total." };
  } catch {
    if (isAiEnabled()) {
      const ai = await aiExtractInvoice(buffer, fileName);
      if (ai) return ai;
    }
    return { ...base, error: "Could not read this PDF." };
  }
}

const aiInvoiceSchema = z.object({
  invoiceNumber: z.string().optional().default(""),
  client: z.string().optional().default(""),
  invoiceDate: z.string(),
  totalUsd: z.number(),
});

/** AI fallback for a single invoice. Always flagged needsReview — a human
 *  confirms any AI-read figure before it is trusted. Returns null on failure. */
async function aiExtractInvoice(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
): Promise<Invoice | null> {
  const pdfBase64 = Buffer.from(
    buffer instanceof Uint8Array ? buffer : Buffer.from(buffer as ArrayBuffer),
  ).toString("base64");

  const result = await extractStructured({
    pdfBase64,
    toolName: "record_invoice",
    toolDescription: "Record the key fields from this TikTok advertising invoice.",
    prompt:
      "Read this TikTok advertising invoice and record the client name, invoice number, invoice date, and the grand Total in USD (not the subtotal).",
    jsonSchema: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string" },
        client: { type: "string" },
        invoiceDate: { type: "string", description: "e.g. 'June 01, 2026'" },
        totalUsd: { type: "number", description: "Grand total in USD" },
      },
      required: ["invoiceDate", "totalUsd"],
    },
    schema: aiInvoiceSchema,
  });
  if (!result) return null;

  const date = parseFlexibleDate(result.invoiceDate);
  if (!date) return null;
  const cents = Math.round(result.totalUsd * 100);

  return {
    fileName,
    invoiceNumber: result.invoiceNumber,
    client: result.client || "Burman Enterprise AB",
    company: "BE",
    dateISO: date.iso,
    cents,
    proposedName: buildInvoiceName(cents, date),
    drivePath: buildDrivePath(date),
    source: "ai",
    needsReview: true,
  };
}

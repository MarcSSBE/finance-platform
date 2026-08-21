/**
 * Live test of the AI fallback (requires ANTHROPIC_API_KEY in .env).
 * Sends a REAL invoice PDF to Claude via our extractStructured helper and
 * checks it returns the known fields (total 160.83, date June 01 2026).
 *
 * Run: npx tsx scripts/verify-ai.mts
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

// Load .env (tsx does not auto-load it) — set env before importing the client.
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { extractStructured, isAiEnabled } = await import("../src/lib/ai/claude");

console.log("AI enabled:", isAiEnabled());
if (!isAiEnabled()) {
  console.log("No key — skipping.");
  process.exit(0);
}

const file =
  "test-data/project-2/Tiktok Invoices/BDTTUSA20263341102-Burman Enterprise AB-Invoice.pdf";
const pdfBase64 = readFileSync(file).toString("base64");

const schema = z.object({
  invoiceNumber: z.string().optional().default(""),
  client: z.string().optional().default(""),
  invoiceDate: z.string(),
  totalUsd: z.number(),
});

const t0 = Date.now();
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
      invoiceDate: { type: "string" },
      totalUsd: { type: "number" },
    },
    required: ["invoiceDate", "totalUsd"],
  },
  schema,
});

console.log(`Claude responded in ${Date.now() - t0}ms`);
console.log("Result:", JSON.stringify(result, null, 2));

const ok =
  result !== null &&
  Math.round(result.totalUsd * 100) === 16083 &&
  /jun/i.test(result.invoiceDate) &&
  /1|01/.test(result.invoiceDate);
console.log(`\n${ok ? "✓ PASS — AI extracted the correct total and date" : "✗ FAIL"}`);
process.exit(ok ? 0 : 1);

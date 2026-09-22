/**
 * Regression harness for the REAL August 2026 Amazon fee invoices (Project 3).
 *
 * These are the 13 documents Veronica uploaded that exposed the parser gaps
 * (credit notes, German/Polish/British layouts, doc-type classification). This
 * asserts every one now parses DETERMINISTICALLY (source = "text", no AI, no
 * error) to the correct country, type, currency, signed total, and filename.
 *
 * The PDFs live in test-data/project-3/aug-2026/ (gitignored — real financial
 * data). Named "<CC>__<invoiceNumber>.pdf" by scripts that pulled them from
 * Drive. Run with: npx tsx scripts/verify-amazon-aug.mts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { parseAmazonInvoice } from "../src/lib/amazon/parse";
import type { AmazonDocType } from "../src/lib/amazon/types";

const DIR = "test-data/project-3/aug-2026";

interface Expected {
  country: string;
  docType: AmazonDocType;
  currency: string;
  totalCents: number;
  proposedName: string;
}

// Keyed by invoice number (stable, language-independent).
const EXPECTED: Record<string, Expected> = {
  "SE-AEU-2026-38655": { country: "BE", docType: "merchant-vat-invoice", currency: "EUR", totalCents: 10307, proposedName: "Amazon BE Merchant EUR 103.07.pdf" },
  "SE-CN-AEU-2026-8586": { country: "FR", docType: "merchant-credit-note", currency: "EUR", totalCents: -12818, proposedName: "Amazon FR Merchant VAT credit EUR 128.18.pdf" },
  "SE-CN-AEU-2026-8785": { country: "NL", docType: "merchant-credit-note", currency: "EUR", totalCents: -2354, proposedName: "Amazon NL Merchant VAT credit EUR 23.54.pdf" },
  "SE-CN-AEU-2026-8501": { country: "UK", docType: "merchant-credit-note", currency: "GBP", totalCents: -979, proposedName: "Amazon UK Merchant VAT credit GBP 9.79.pdf" },
  "SE-AEU-2026-37307": { country: "DE", docType: "fba-tax-invoice", currency: "EUR", totalCents: 2732774, proposedName: "Amazon DE Fulfillment EUR 27,327.74.pdf" },
  "SE-AEU-2026-39310": { country: "PL", docType: "merchant-vat-invoice", currency: "PLN", totalCents: 5540, proposedName: "Amazon PL Merchant PLN 55.40.pdf" },
  "SE-AEU-2026-42306": { country: "DE", docType: "merchant-vat-invoice", currency: "EUR", totalCents: 83833, proposedName: "Amazon DE Merchant EUR 838.33.pdf" },
  "SE-AEU-2026-42314": { country: "NL", docType: "merchant-vat-invoice", currency: "EUR", totalCents: 809, proposedName: "Amazon NL Merchant EUR 8.09.pdf" },
  "SE-AEU-2026-38732": { country: "ES", docType: "fba-tax-invoice", currency: "EUR", totalCents: 17555, proposedName: "Amazon ES Fulfillment EUR 175.55.pdf" },
  "SE-AEU-2026-42307": { country: "IT", docType: "fba-tax-invoice", currency: "EUR", totalCents: 20843, proposedName: "Amazon IT Fulfillment EUR 208.43.pdf" },
  "SE-AEU-2026-42308": { country: "IT", docType: "merchant-vat-invoice", currency: "EUR", totalCents: 10325, proposedName: "Amazon IT Merchant EUR 103.25.pdf" },
  "SE-AEU-2026-37272": { country: "UK", docType: "fba-tax-invoice", currency: "GBP", totalCents: 3252242, proposedName: "Amazon UK Fulfillment GBP 32,522.42.pdf" },
  "SE-AEU-2026-42311": { country: "UK", docType: "merchant-vat-invoice", currency: "GBP", totalCents: 73349, proposedName: "Amazon UK Merchant GBP 733.49.pdf" },
};

if (!existsSync(DIR)) {
  console.error(`Missing ${DIR}. This test needs the real Aug PDFs present locally.`);
  process.exit(1);
}

let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) fail++;
  console.log(`    ${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}

const files = readdirSync(DIR).filter((f) => /\.pdf$/i.test(f));
console.log(`Parsing ${files.length} August invoices from ${DIR}\n`);

const seen = new Set<string>();
for (const file of files.sort()) {
  const inv = await parseAmazonInvoice(readFileSync(`${DIR}/${file}`), file);
  const exp = EXPECTED[inv.invoiceNumber];
  console.log(`  ${file}  ->  ${inv.proposedName || "(no name)"}`);
  if (!exp) {
    console.log(`    ✗ no expectation for invoice ${inv.invoiceNumber || "(unread)"}`);
    fail++;
    continue;
  }
  seen.add(inv.invoiceNumber);
  check("source", inv.source, "text");
  check("needsReview", inv.needsReview, false);
  check("error", inv.error ?? null, null);
  check("country", inv.country, exp.country);
  check("docType", inv.docType, exp.docType);
  check("currency", inv.currency, exp.currency);
  check("totalCents", inv.totalCents, exp.totalCents);
  check("dateISO", inv.dateISO, "2026-08-31");
  check("drivePath", inv.drivePath, `Accounting/08. Aug 2026/Amazon/${exp.country}`);
  check("proposedName", inv.proposedName, exp.proposedName);
  console.log("");
}

const missing = Object.keys(EXPECTED).filter((k) => !seen.has(k));
if (missing.length) {
  console.log(`✗ Expected invoices not found in ${DIR}: ${missing.join(", ")}`);
  fail += missing.length;
}

console.log(fail === 0 ? `\n✅ All ${files.length} August invoices parse correctly (deterministic).` : `\n❌ ${fail} assertion(s) failed.`);
process.exit(fail === 0 ? 0 : 1);

/**
 * Verification harness for the deterministic Amazon fee-invoice parser (P3).
 * Runs the REAL parser against the REAL Belgium sample invoice and asserts every
 * deterministic field, so a regex regression is caught immediately.
 *
 * Run with: npx tsx scripts/verify-amazon.mts
 */
import { readFileSync } from "node:fs";
import { parseAmazonInvoice, detectDocType } from "../src/lib/amazon/parse";
import { buildAmazonName, buildAmazonDrivePath } from "../src/lib/amazon/naming";
import { parseMoneyToCents, formatCents } from "../src/lib/amazon/dates";
import type { AmazonDocType } from "../src/lib/amazon/types";

let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  const ok = got === expected;
  if (!ok) fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}

// --- Unit checks on the money parser (locale robustness) ---
const money: [string, number | null][] = [
  ["14.48", 1448],
  ["18.10", 1810],
  ["EUR 3.62", 362],
  ["1.234,56", 123456],
  ["1,234.56", 123456],
  ["39.77", 3977],
];
console.log("money parser:");
for (const [input, expected] of money) check(input, parseMoneyToCents(input), expected);

// --- Integration check against the real Belgium invoice ---
const file = "test-data/project-3/SE-AEU-2026-33639.pdf";
const buf = readFileSync(file);
const inv = await parseAmazonInvoice(buf, "SE-AEU-2026-33639.pdf");

console.log(`\nParsed ${file}:`);
console.log(`  source=${inv.source} needsReview=${inv.needsReview}`);
console.log(`  ${inv.proposedName}  ->  ${inv.drivePath}`);
console.log(`  total ${inv.currency} ${formatCents(inv.totalCents)} (net ${formatCents(inv.netCents)} + vat ${formatCents(inv.vatCents)})`);

check("invoiceNumber", inv.invoiceNumber, "SE-AEU-2026-33639");
check("country", inv.country, "BE");
check("marketplace", inv.marketplace, "Amazon.com.be");
check("docType", inv.docType, "merchant-vat-invoice");
check("dateISO", inv.dateISO, "2026-07-31");
check("currency", inv.currency, "EUR");
check("netCents", inv.netCents, 1448);
check("vatCents", inv.vatCents, 362);
check("totalCents", inv.totalCents, 1810);
check("homeCurrency", inv.homeCurrency, "SEK");
check("homeTotalCents", inv.homeTotalCents, 3977);
check("proposedName", inv.proposedName, "Amazon BE Merchant EUR 18.10.pdf");
check("drivePath", inv.drivePath, "Accounting/07. Jul 2026/Amazon/BE");
check("no error", inv.error ?? null, null);

// --- Doc-type detection across languages, incl. the credit-note fulfillment/merchant split ---
// (the one sample PDF only exercises "merchant-vat-invoice", so cover the rest synthetically)
console.log("\ndoc-type detection:");
const typeCases: [string, string, AmazonDocType][] = [
  ["FR fulfillment invoice", "Facture fiscale Expédié par Amazon ... Amazon.fr", "fba-tax-invoice"],
  ["NL merchant invoice", "Btw-factuur Verkopen via Amazon ... Amazon.com.be", "merchant-vat-invoice"],
  ["DE fulfillment credit", "Gutschrift Versand durch Amazon ... Amazon.de", "fba-credit-note"],
  ["FR merchant credit", "Note de crédit Vente sur Amazon ... Amazon.fr", "merchant-credit-note"],
  ["EPR service invoice", "EPR service invoice pay on behalf ... Amazon.fr", "epr-service-invoice"],
  // Localizations that fell through to "other" and produced untyped filenames like
  // "Amazon SE SEK 95.43.pdf" in Veronica's Aug batch (fixed 2026-09-24).
  ["SE merchant invoice", "Avgifter för Sälja på Amazon ... Amazon.se", "merchant-vat-invoice"],
  ["SE fulfillment invoice", "Avgifter för Fraktas från Amazon ... Amazon.se", "fba-tax-invoice"],
  ["FR fulfillment (noun form)", "Frais d'expédition par Amazon ... Amazon.fr", "fba-tax-invoice"],
  ["ES merchant (vender)", "Tarifas de vender en Amazon ... Amazon.es", "merchant-vat-invoice"],
  ["PL fulfillment", "Opłaty za realizację przez Amazon ... Amazon.pl", "fba-tax-invoice"],
  ["AE Souq storage (FBA)", "Storage Billing AED 0.02 ... Souq.com FZ LLC", "fba-tax-invoice"],
];
for (const [label, text, expected] of typeCases) check(label, detectDocType(text), expected);

// --- Filename + Drive path across every type (must match Veronica's confirmed spec) ---
console.log("\nnaming spec (Veronica, confirmed 2026-09-21):");
check(
  "FR fulfillment credit name",
  buildAmazonName({ currency: "EUR", totalCents: 40538, country: "FR", docType: "fba-credit-note" }),
  "Amazon FR Fulfillment VAT credit EUR 405.38.pdf", // her literal example
);
check(
  "BE merchant name",
  buildAmazonName({ currency: "EUR", totalCents: 20226, country: "BE", docType: "merchant-vat-invoice" }),
  "Amazon BE Merchant EUR 202.26.pdf",
);
check(
  "DE FBA name",
  buildAmazonName({ currency: "EUR", totalCents: 1000, country: "DE", docType: "fba-tax-invoice" }),
  "Amazon DE Fulfillment EUR 10.00.pdf",
);
check(
  "SE EPR name",
  buildAmazonName({ currency: "SEK", totalCents: 12345, country: "SE", docType: "epr-service-invoice" }),
  "Amazon SE EPR SEK 123.45.pdf",
);
check(
  "per-country Drive path",
  buildAmazonDrivePath({ y: 2026, m: 7, d: 15, iso: "2026-08-15", ordinalMs: 0 }, "FR"),
  "Accounting/08. Aug 2026/Amazon/FR",
);

console.log(`\n${fail === 0 ? "✓ PASS" : `✗ FAIL — ${fail} check(s) failed`}`);
process.exit(fail === 0 ? 0 : 1);

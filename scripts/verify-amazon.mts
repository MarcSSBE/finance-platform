/**
 * Verification harness for the deterministic Amazon fee-invoice parser (P3).
 * Runs the REAL parser against the REAL Belgium sample invoice and asserts every
 * deterministic field, so a regex regression is caught immediately.
 *
 * Run with: npx tsx scripts/verify-amazon.mts
 */
import { readFileSync } from "node:fs";
import { parseAmazonInvoice } from "../src/lib/amazon/parse";
import { parseMoneyToCents, formatCents } from "../src/lib/amazon/dates";

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

console.log(`\n${fail === 0 ? "✓ PASS" : `✗ FAIL — ${fail} check(s) failed`}`);
process.exit(fail === 0 ? 0 : 1);

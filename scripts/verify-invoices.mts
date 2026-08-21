/**
 * End-to-end verification for the Ads Invoice reconciliation (Project 2),
 * run against the REAL June test data.
 *
 * Expected from the meeting analysis:
 *   - 10 statement payments, 10 invoices
 *   - 9 matched
 *   - 1 payment with no invoice: 419.04
 *   - 1 invoice with no payment: 500.00 (dated Jun 23)
 *   - invoice total 4,456.33 ; payment total 4,475.37 (off by 19.04)
 *   - naming: "Tiktok $160.83 01 jun-26 BE.pdf" ; path "Accounting/06. Jun 2026/Tiktok"
 *
 * Run: npx tsx scripts/verify-invoices.mts
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseStatement, parseInvoice } from "../src/lib/invoices/parse";
import { reconcile } from "../src/lib/invoices/reconcile";
import { formatCents } from "../src/lib/invoices/dates";

const DIR = "test-data/project-2";
const INVOICE_DIR = path.join(DIR, "Tiktok Invoices");

const statement = await parseStatement(
  readFileSync(path.join(DIR, "Tiktok ads juni-26 (1).pdf")),
);
console.log(`Statement payments: ${statement.payments.length} (period: ${statement.period})`);

const files = readdirSync(INVOICE_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
const invoices = await Promise.all(
  files.map((f) => parseInvoice(readFileSync(path.join(INVOICE_DIR, f)), f)),
);

console.log("\nParsed invoices:");
for (const inv of invoices.sort((a, b) => a.dateISO.localeCompare(b.dateISO))) {
  console.log(
    `  ${inv.dateISO}  ${formatCents(inv.cents).padStart(8)}  →  ${inv.proposedName}  [${inv.drivePath}]${inv.error ? "  ERROR:" + inv.error : ""}`,
  );
}

const r = reconcile(statement.payments, invoices);
console.log(`\nMatched: ${r.matched.length}`);
console.log(`Payments without invoice: ${r.paymentsWithoutInvoice.map((p) => formatCents(p.cents)).join(", ") || "none"}`);
console.log(`Invoices without payment: ${r.invoicesWithoutPayment.map((i) => formatCents(i.cents) + " (" + i.dateISO + ")").join(", ") || "none"}`);
console.log(`Unreadable: ${r.unreadable.length}`);
console.log(`Invoice total: ${formatCents(r.invoiceTotalCents)} | Payment total: ${formatCents(r.paymentTotalCents)} | diff ${formatCents(r.paymentTotalCents - r.invoiceTotalCents)}`);

const checks: [string, boolean][] = [
  ["10 payments", statement.payments.length === 10],
  ["10 invoices parsed", invoices.length === 10 && invoices.every((i) => !i.error)],
  ["9 matched", r.matched.length === 9],
  ["1 payment w/o invoice = 419.04", r.paymentsWithoutInvoice.length === 1 && r.paymentsWithoutInvoice[0].cents === 41904],
  ["1 invoice w/o payment = 500.00", r.invoicesWithoutPayment.length === 1 && r.invoicesWithoutPayment[0].cents === 50000],
  ["invoice total 4,456.33", r.invoiceTotalCents === 445633],
  ["payment total 4,375.37", r.paymentTotalCents === 437537],
  ["naming ok", invoices.some((i) => i.proposedName === "Tiktok $160.83 01 jun-26 BE.pdf")],
  ["path ok", invoices.every((i) => i.error || i.drivePath === "Accounting/06. Jun 2026/Tiktok")],
];
console.log("");
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (!ok) failed++;
}
console.log(`\n${failed === 0 ? "✓ ALL PASS" : `✗ ${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);

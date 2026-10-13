/**
 * Verification for the Amex statement parser (Project 4), run against the REAL
 * statement dated 2026-10-02 (period 03.09.26 till 02.10.26).
 *
 * Expected, read off the PDF by hand:
 *   - 58 purchase-side rows (57 purchases + the annual card fee), 2 payments
 *   - "Summan av alla nya köp" 246.839,24 SEK = sum of parsed rows
 *   - payments -151.000,00 and -100.000,00
 *   - Helium 10: SEK 1.984,24 = USD 197.00 + fee 38,91 (dated 20.09.26)
 *   - Lovable: 25,00 EUR; Carotte Werket: domestic SEK 298,00 (no fee)
 *
 * Run: npx tsx scripts/verify-amex.mts
 */
import { readFileSync } from "node:fs";
import { parseAmexStatement } from "../src/lib/amex/parse";

const s = await parseAmexStatement(
  readFileSync("test-data/project-4/amex-statement-2026-10-02.pdf"),
);

const fmt = (c: number) => (c / 100).toFixed(2);
console.log(`Statement ${s.statementDateISO}, period ${s.periodStartISO} → ${s.periodEndISO}, card …${s.cardEnding}`);
for (const l of s.lines) {
  console.log(
    `  ${l.dateISO}  ${l.kind.padEnd(8)} ${fmt(l.sekCents).padStart(11)} SEK  ${fmt(l.originalCents).padStart(10)} ${l.originalCurrency}  fee ${fmt(l.feeSekCents).padStart(6)}  ${l.description}`,
  );
}
console.log(`Parsed purchases ${fmt(s.parsedPurchasesCents)} | printed ${s.printedPurchasesCents === null ? "?" : fmt(s.printedPurchasesCents)}`);

const find = (re: RegExp) => s.lines.find((l) => re.test(l.description));
const helium = find(/Helium 10/);
const lovable = find(/Lovable/);
const carotte = find(/Carotte/);
const payments = s.lines.filter((l) => l.kind === "payment");
const purchaseSide = s.lines.filter((l) => l.kind !== "payment");

const checks: [string, boolean][] = [
  ["header dates", s.statementDateISO === "2026-10-02" && s.periodStartISO === "2026-09-03" && s.periodEndISO === "2026-10-02"],
  ["card ending 32008", s.cardEnding === "32008"],
  ["58 purchase-side rows", purchaseSide.length === 58],
  ["57 need a receipt", s.lines.filter((l) => l.needsReceipt).length === 57],
  ["1 card fee 575.00", s.lines.filter((l) => l.kind === "card-fee").length === 1 && find(/Årsavgift/)?.sekCents === 57500],
  ["2 payments = -251,000.00", payments.length === 2 && payments.reduce((a, l) => a + l.sekCents, 0) === -25100000],
  ["printed total 246,839.24", s.printedPurchasesCents === 24683924],
  ["parsed total matches printed", s.totalsMatch],
  ["Helium 10 = USD 197.00 / fee 38.91 / SEK 1,984.24 / 2026-09-20",
    helium?.originalCurrency === "USD" && helium.originalCents === 19700 && helium.feeSekCents === 3891 && helium.sekCents === 198424 && helium.dateISO === "2026-09-20"],
  ["Lovable = EUR 25.00", lovable?.originalCurrency === "EUR" && lovable.originalCents === 2500],
  ["Carotte = domestic SEK 298.00", carotte?.originalCurrency === "SEK" && carotte.originalCents === 29800 && carotte.feeSekCents === 0],
  ["16 Google Ads rows of USD 1,000 or 547.89", s.lines.filter((l) => /google\s*\*\s*ads/i.test(l.description)).length === 16],
  ["every foreign row has a fee", s.lines.every((l) => l.originalCurrency === "SEK" || l.feeSekCents > 0)],
  ["no empty descriptions", s.lines.every((l) => l.description.length > 0)],
];

console.log("");
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);

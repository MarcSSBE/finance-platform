/**
 * Verification harness for the deterministic income parser.
 * Runs the REAL parser against the REAL July test file and asserts the total
 * matches the confirmed baseline of 3,619.59 USD (28 rows).
 *
 * Run with: npx tsx scripts/verify-income.mts
 */
import { readFileSync } from "node:fs";
import { parseIncomeWorkbook } from "../src/lib/income/parse";
import { formatCents, parseAmountToCents } from "../src/lib/income/money";

// --- Unit checks on the money parser (locale/format robustness) ---
const cases: [unknown, number | null][] = [
  ["110.23", 11023],
  ["8.34", 834],
  ["1,234.56", 123456],
  ["1.234,56", 123456],
  ["1 234,56", 123456],
  ["1,234", 123400], // pure thousands grouping
  ["-12.50", -1250],
  ["(12.50)", -1250],
  ["", null],
  ["abc", null],
  [110.23, 11023],
];
let unitFail = 0;
for (const [input, expected] of cases) {
  const got = parseAmountToCents(input);
  const gotCents = got === null ? null : got.cents;
  const ok = gotCents === expected;
  if (!ok) {
    unitFail++;
    console.error(`  ✗ parseAmountToCents(${JSON.stringify(input)}) = ${gotCents}, expected ${expected}`);
  }
}
console.log(unitFail === 0 ? "✓ money parser unit checks passed" : `✗ ${unitFail} money unit checks FAILED`);

// --- Integration check against the real file ---
const file = "test-data/project-1/Tictok inc Worldfirst_2026-07-01_2026-07-31 BE.xlsx";
const buf = readFileSync(file);
const summary = await parseIncomeWorkbook(buf, { fileName: file });

console.log(`\nFile: ${summary.fileName}`);
console.log(`Amount column: ${summary.amountColumn} ("${summary.amountHeader}")`);
console.log(`Counted rows: ${summary.rows.length} / ${summary.totalRows}`);
console.log(`Skipped: ${summary.skipped.length}`);
for (const t of summary.totalsByCurrency) {
  console.log(`  TOTAL ${t.currency}: ${formatCents(t.cents)} (${t.count} rows)`);
}

const usd = summary.totalsByCurrency.find((t) => t.currency === "USD");
const expectedCents = 361959;
const pass = usd?.cents === expectedCents && summary.rows.length === 28;
console.log(`\n${pass ? "✓ PASS" : "✗ FAIL"} — expected 3,619.59 USD over 28 rows`);
process.exit(pass && unitFail === 0 ? 0 : 1);

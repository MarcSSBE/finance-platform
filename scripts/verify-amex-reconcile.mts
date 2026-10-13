/**
 * Verification for Amex receipt naming + matching (Project 4, step 2).
 *
 * Part 1: Veronica's 8 REAL filenames from her Amex folder (Aug 2026) must parse
 * to the right vendor/amount/month/day and rebuild to the exact same name.
 *
 * Part 2: match a receipt set against the REAL statement (2026-10-02, period
 * 03.09.26-02.10.26). The receipts are written in her convention; expected
 * outcomes were worked out by hand from the statement lines:
 *   - 20 matched (incl. 4 dated TraceFuse $225 picking their own days, a typo
 *     "Twillio"-style vendor "Midjurney", "Ahref", Facebook→"Facebk" alias,
 *     Swedish month "okt", comma decimals, EUR, and SEK "kr")
 *   - Wispr AI "$150" pairs with the SEK 150.00 charge but is flagged
 *     currency-differs (her "$" vs the statement's SEK)
 *   - Heroku "$532,10" does NOT match the USD 532.11 charge (exact cents only)
 *   - "Channel $49" fits Flippa's amount+date but not its vendor → hint only
 *   - "Zendesk $115 Sep1-26" is before the period → outside, not unmatched
 *   - 57 charges need a receipt → 37 missing; TraceFuse Sep 21 among them
 *
 * Run: npx tsx scripts/verify-amex-reconcile.mts
 */
import { readFileSync } from "node:fs";
import { parseAmexStatement } from "../src/lib/amex/parse";
import { buildReceiptName, parseNameAmount, parseReceiptName } from "../src/lib/amex/naming";
import { reconcileAmex, vendorMatches } from "../src/lib/amex/reconcile";
import type { AmexReceipt } from "../src/lib/amex/types";

const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);

// ── Part 1: her real names ──────────────────────────────────────────────────
const REAL: [string, string, number, number | null][] = [
  ["Zendesk $115 aug-26.pdf", "Zendesk", 11500, null],
  ["Wispr AI $150 aug-26.pdf", "Wispr AI", 15000, null],
  ["Webbee $35 aug-26.pdf", "Webbee", 3500, null],
  ["Vadoo $150 aug-26.pdf", "Vadoo", 15000, null],
  ["Twillio $90,10 aug-26.pdf", "Twillio", 9010, null],
  ["TraceFuse $450 Aug16-26.pdf", "TraceFuse", 45000, 16],
  ["TraceFuse $450 Aug10-26.pdf", "TraceFuse", 45000, 10],
  ["TraceFuse $225 Aug30-26.pdf", "TraceFuse", 22500, 30],
];
for (const [name, vendor, cents, day] of REAL) {
  const p = parseReceiptName(name);
  check(
    `parse "${name}"`,
    !!p && p.vendor === vendor && p.cents === cents && p.currency === "USD" && p.year === 2026 && p.month === 7 && p.day === day,
  );
  const rebuilt = p
    ? buildReceiptName({
        vendor: p.vendor,
        cents: p.cents,
        currency: "USD",
        dateISO: `2026-08-${String(p.day ?? 1).padStart(2, "0")}`,
        withDay: p.day !== null,
      })
    : "";
  check(`round-trip "${name}"`, rebuilt === name);
}

check("amount 1,000 = 1000.00", parseNameAmount("1,000") === 100000);
check("amount 1.050,97 = 1050.97", parseNameAmount("1.050,97") === 105097);
check("amount 1,050.97 = 1050.97", parseNameAmount("1,050.97") === 105097);
check("amount 90,1 rejected (ambiguous)", parseNameAmount("90,1") === null);
check("'Helium 10 $197 sep-26' → vendor Helium 10, 197.00", (() => {
  const p = parseReceiptName("Helium 10 $197 sep-26.pdf");
  return p?.vendor === "Helium 10" && p.cents === 19700;
})());
check("download duplicate '(1)' suffix is ignored", (() => {
  const p = parseReceiptName("Zendesk $115 aug-26 (1).pdf");
  return p?.vendor === "Zendesk" && p.cents === 11500 && p.month === 7;
})());
check("unpatterned names rejected", parseReceiptName("scan_0012.pdf") === null && parseReceiptName("Receipt.pdf") === null);
check("vendor: Twillio ~ Twilio", vendorMatches("Twillio", "Twilio Inc San Francisco"));
check("vendor: Google Ads ≠ Heroku", !vendorMatches("Google Ads", "Heroku* Aug-113586609 San Francisco"));
check("vendor: AI alone is not a vendor match", !vendorMatches("Wispr AI", "Leonardo.Ai North Sydney"));

// ── Part 2: match against the real statement ────────────────────────────────
const statement = await parseAmexStatement(readFileSync("test-data/project-4/amex-statement-2026-10-02.pdf"));
const NAMES = [
  "Helium 10 $197 sep-26.pdf",
  "Zendesk $115 sep-26.pdf",
  "TraceFuse $225 Sep8-26.pdf",
  "TraceFuse $225 Sep12-26.pdf",
  "TraceFuse $225 Sep13-26.pdf",
  "TraceFuse $225 Sep14-26.pdf",
  "TraceFuse $675 Sep29-26.pdf",
  "Wispr AI $150 sep-26.pdf",
  "Twillio $90,10 sep-26.pdf",
  "Google Ads $1000 Sep3-26.pdf",
  "Google Ads $1000 Sep5-26.pdf",
  "Pickfu $75 Sep10-26.pdf",
  "Pickfu $50 Sep13-26.pdf",
  "Lovable €25 sep-26.pdf",
  "Slack $280 sep-26.pdf",
  "Openai ChatGPT $125 sep-26.pdf",
  "Facebook 238,77 kr sep-26.pdf",
  "Ahref $149 sep-26.pdf",
  "Midjurney $30 sep-26.pdf",
  "Manychat $31,25 okt-26.pdf",
  "Shopify $1050,97 sep-26.pdf",
  "Heroku $532,10 sep-26.pdf",
  "Channel $49 sep-26.pdf",
  "Zendesk $115 Sep1-26.pdf",
  "scan_0012.pdf",
  "Receipt.pdf",
];
const receipts: AmexReceipt[] = [];
const unreadable: string[] = [];
for (const n of NAMES) {
  const p = parseReceiptName(n);
  if (p) receipts.push(p);
  else unreadable.push(n);
}
const r = reconcileAmex(statement, receipts, unreadable);
const line = (i: number) => statement.lines[i];
const matchOf = (file: string) => r.matched.find((m) => m.receipt.fileName === file);

console.log("\nMatched:");
for (const m of r.matched) {
  const l = line(m.lineIndex);
  console.log(`  ${l.dateISO}  ${(l.originalCents / 100).toFixed(2).padStart(8)} ${l.originalCurrency}  ${l.description.padEnd(42)} ← ${m.receipt.fileName}${m.notes.length ? `  [${m.notes}]` : ""}`);
}
console.log(`Missing (${r.missing.length}):`);
for (const i of r.missing) console.log(`  ${line(i).dateISO}  ${(line(i).originalCents / 100).toFixed(2).padStart(8)} ${line(i).originalCurrency}  ${line(i).description}`);
console.log("Unmatched receipts:", r.unmatchedReceipts.map((x) => x.fileName));
console.log("Outside period:", r.outsidePeriod.map((x) => x.fileName));
console.log("Unreadable:", r.unreadableNames);
console.log("Hints:", r.hints.map((h) => `${line(h.lineIndex).description} ← ${h.fileNames}`));

const tfDays = ["Sep8", "Sep12", "Sep13", "Sep14"].map((d) => line(matchOf(`TraceFuse $225 ${d}-26.pdf`)!.lineIndex).dateISO);
check("20 matched", r.matched.length === 20);
check("37 missing (57 - 20)", r.missing.length === 37);
check("each dated TraceFuse $225 took its own day", tfDays.join() === "2026-09-08,2026-09-12,2026-09-13,2026-09-14");
check("TraceFuse 2026-09-21 $225 is missing", r.missing.some((i) => /Tracefuse/.test(line(i).description) && line(i).dateISO === "2026-09-21"));
check("Wispr matched with currency-differs", matchOf("Wispr AI $150 sep-26.pdf")?.notes.includes("currency-differs") === true);
check("Lovable EUR matched, no note", matchOf("Lovable €25 sep-26.pdf")?.notes.length === 0);
check("Facebook alias → Facebk SEK 238.77", /Facebk/.test(line(matchOf("Facebook 238,77 kr sep-26.pdf")?.lineIndex ?? -1)?.description ?? ""));
check("Manychat via 'okt' → 2026-10-01", line(matchOf("Manychat $31,25 okt-26.pdf")?.lineIndex ?? -1)?.dateISO === "2026-10-01");
check("Shopify 1050,97 matched", !!matchOf("Shopify $1050,97 sep-26.pdf"));
check("Heroku 532,10 NOT matched (exact cents)", !matchOf("Heroku $532,10 sep-26.pdf") && r.missing.some((i) => /Heroku/.test(line(i).description)));
check("Unmatched = Twillio, Heroku, Channel", r.unmatchedReceipts.map((x) => x.fileName).sort().join("|") === ["Channel $49 sep-26.pdf", "Heroku $532,10 sep-26.pdf", "Twillio $90,10 sep-26.pdf"].sort().join("|"));
check("Outside period = Zendesk Sep1", r.outsidePeriod.length === 1 && r.outsidePeriod[0].fileName === "Zendesk $115 Sep1-26.pdf");
check("Unreadable = 2", r.unreadableNames.length === 2);
check("Hint: Flippa ← Channel $49", r.hints.length === 1 && /Flippa/.test(line(r.hints[0].lineIndex).description) && r.hints[0].fileNames[0] === "Channel $49 sep-26.pdf");
check("card fee + payments never 'missing'", r.missing.every((i) => line(i).kind === "purchase"));
check("no receipt used twice", new Set(r.matched.map((m) => m.receipt.fileName)).size === r.matched.length);
check("no charge matched twice", new Set(r.matched.map((m) => m.lineIndex)).size === r.matched.length);
check("every match has equal amount", r.matched.every((m) => line(m.lineIndex).originalCents === m.receipt.cents));

console.log("");
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);

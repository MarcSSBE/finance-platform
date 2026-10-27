/**
 * Verification for Veronica's 2026-10-22 round (real data, gitignored in
 * test-data/project-4/):
 *
 *   - The WorldFirst August statement PDFs (one per currency account: USD,
 *     EUR, GBP, CAD), which she sent instead of the .xlsx export. Every row is
 *     rebuilt from text positions and the In/Out totals must equal the printed
 *     summary (and opening + in - out = closing).
 *   - Her August WorldFirst receipt folder (32 receipts) against the Aug Amex
 *     statement (09-02) + the four PDFs together. Checked by hand against the
 *     PDFs first: 27 matched, of which 10 are supplier invoices paid by bank
 *     transfer (Ships a Lot x4, Delgate, Fulfillment-Box x2, Kings Park, Shay
 *     Diaz, Noons Memes = "Transfer-Nantawan Sapsakul", the issuer on her
 *     invoice). Left: Blotato $20 (charge $29.00) and MongoDB $223,98 (charge
 *     $222.45) as amount hints, Heroku Aug01 (charged in Sep), the Uflex refund
 *     (money in, not a charge), HMRC May-July (a July bill).
 *   - Her answers on the July round: Kalowave = KALODATA, Jungle Scout =
 *     "JS API SUBSCRIPTION", Hector AI = "RAZ*httpwwwneondigital", Antrophics =
 *     Anthropic; "Heroku $315,57" was a typo for 315,37; Heroku Jul01 $323,72
 *     is the 5 Aug charge on the August statement.
 *
 * Run: npx tsx scripts/verify-amex-august.mts
 */
import { readFileSync } from "node:fs";
import { combineStatements } from "../src/lib/amex/combine";
import { parseReceiptName } from "../src/lib/amex/naming";
import { parseAmexStatement } from "../src/lib/amex/parse";
import { reconcileAmex } from "../src/lib/amex/reconcile";
import { parseWorldFirstPdf, parseWorldFirstStatement } from "../src/lib/amex/worldfirst";
import type { AmexStatement } from "../src/lib/amex/types";

const DIR = "test-data/project-4";
const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);

// ── WorldFirst statement PDFs ───────────────────────────────────────────────
const wf: Record<string, AmexStatement> = {};
for (const [cur, rows] of [["USD", 93], ["EUR", 27], ["GBP", 5], ["CAD", 3]] as const) {
  const s = await parseWorldFirstPdf(readFileSync(`${DIR}/worldfirst-${cur}-2026-08.pdf`));
  wf[cur] = s;
  check(
    `${cur} PDF: ${rows} rows, Aug 1-31, totals equal the printed summary`,
    s.lines.length === rows && s.account === cur && s.periodStartISO === "2026-08-01" &&
      s.periodEndISO === "2026-08-31" && s.totalsMatch && s.lines.every((l) => l.originalCurrency === cur),
  );
}
const find = (s: AmexStatement, re: RegExp) => s.lines.filter((l) => re.test(l.description));
const heroku = find(wf.USD, /^HEROKU/)[0];
check("Heroku JUL charge: 5 Aug, USD 323.72, needs a receipt",
  heroku?.dateISO === "2026-08-05" && heroku.originalCents === 32372 && heroku.needsReceipt);
check("Anthropic Claude Sub: 4 Aug, EUR 108.90 on the EUR account",
  find(wf.EUR, /CLAUDE SUB/)[0]?.originalCents === 10890 && find(wf.EUR, /CLAUDE SUB/)[0]?.dateISO === "2026-08-04");
check("card text cut before the card reference: 'OPENPHONE SAN FRANCISCO USA'",
  find(wf.USD, /^OPENPHONE/)[0]?.description === "OPENPHONE SAN FRANCISCO USA");
check("wrapped names rejoined: 'Transfer-Fulfillment-Box(DE74290501010082962127)'",
  find(wf.EUR, /Fulfillment-Box/).length === 2 &&
    find(wf.EUR, /Fulfillment-Box/).every((l) => l.description === "Transfer-Fulfillment-Box(DE74290501010082962127)"));
check("currency conversions need no receipt (both sides)",
  Object.values(wf).flatMap((s) => find(s, /^Conversion-/)).length === 4 &&
    Object.values(wf).flatMap((s) => find(s, /^Conversion-/)).every((l) => !l.needsReceipt));
check("money in (Collection-, Cash Reward-) is a credit, no receipt",
  Object.values(wf).flatMap((s) => find(s, /^(Collection|Cash Reward)-/)).every((l) => l.kind === "credit" && l.originalCents < 0));
check("TikTok Ads (21 rows) left to the Ads feature", wf.USD.lines.filter((l) => l.kind === "tiktok-ads").length === 21);
check("cards needing a receipt: USD 30, EUR 6, GBP 0, CAD 0",
  ["USD", "EUR", "GBP", "CAD"].map((c) => wf[c].lines.filter((l) => l.needsReceipt).length).join() === "30,6,0,0");

// ── Names she wrote this month ──────────────────────────────────────────────
const fulbox = parseReceiptName("FUL-BOX $909,72-$325,40=$584,32 aug-26 BE.pdf");
check("worked sum reads the amount paid: FUL-BOX ... =$584,32", fulbox?.cents === 58432 && fulbox.vendor === "FUL-BOX");
const hmrc = parseReceiptName("HMRC GB maj- juli-26  £355,92.pdf");
check("amount after a month range: HMRC GB maj- juli-26 £355,92 → GBP 355.92, July",
  hmrc?.cents === 35592 && hmrc.currency === "GBP" && hmrc.month === 6 && hmrc.vendor === "HMRC GB");
check("a normal name is unchanged by the new rules",
  JSON.stringify(parseReceiptName("Twillio $90,10 aug-26.pdf")) ===
    JSON.stringify({ fileName: "Twillio $90,10 aug-26.pdf", vendor: "Twillio", cents: 9010, currency: "USD", year: 2026, month: 7, day: null }));

// ── Her August WorldFirst folder ────────────────────────────────────────────
const AUG = [
  "Anthropic $108,90 aug-26.pdf", "Anthropic $420,83 aug-26.pdf",
  "Återbet fordring Uflex 223 588,24 kr ($24155,82) aug-26.pdf", "Blotato $20 aug-26.pdf",
  "Capcut €6,84 aug-26.png", "Delgate July Invoice 3701 $2265,76 aug-26 BE.pdf",
  "Dollar Invoice_14725July 25 - 31 $3064,50 Aug-26 BE.pdf", "Dollar Invoice_14862_Aug 8-14 $1432,96 aug-26 BE.pdf",
  "Dollar Ships A Lot Invoice_14796 - Aug 1 - 7 $3837,75 aug-26 BE.pdf", "Eleven Labs $22 aug-26.pdf",
  "EukaAI $1599 aug-26.pdf", "FUL-BOX $909,72-$325,40=$584,32 aug-26 BE.pdf",
  "FULF-BOX-2026-1689 July €1518,24 Aug-26 BE.pdf", "GS1 $187,50 aug-26.pdf",
  "Heroku _ Invoice_Aug01_$327,64 aug-26.pdf", "Higgsfield $36,25 aug-26.pdf",
  "HMRC GB maj- juli-26  £355,92.pdf", "IMG GlobeHopper(SM) $240,38 aug-26.pdf",
  "KingsPark July Invoice INV-3308 £429,14 aug-26 BE.pdf", "Million dollar sellers $5997 aug-26.pdf",
  "MongoDB $223,98 aug-26.pdf", "MyUS-RELEASE-ShipmentInvoice_72602382 $10 aug-26.pdf",
  "Noons Memes Invoice  2026 - Invoice August26 $387,50 aug-26.pdf", "Shay Diaz $3670 aug-26.pdf",
  "Ships a lot Invoice_14931_Aug 15 - 21 $3013,68 aug-26 BE.pdf", "Taxually €118 aug-26.pdf",
  "Taxually €150 aug-26.pdf", "Titan $8000 aug-26.pdf", "Vadoo $150 aug-26 (2).pdf", "Vadoo $20 aug-26.pdf",
  "Vercel $60 aug-26.pdf", "Wayward $55,65 aug-26.pdf",
];
const amexAug = await parseAmexStatement(readFileSync(`${DIR}/amex-statement-2026-09-02.pdf`));
const aug = combineStatements([amexAug, wf.USD, wf.EUR, wf.GBP, wf.CAD]);
const parsedAug = AUG.map((n) => parseReceiptName(n));
check("all 32 August names readable", parsedAug.every(Boolean));
const ra = reconcileAmex(aug, parsedAug.filter((p) => p !== null));
const lineOf = (i: number) => aug.lines[i];
const matchOf = (re: RegExp) => ra.matched.filter((m) => re.test(m.receipt.fileName));
console.log(`August: ${ra.matched.length} matched / ${ra.missing.length} missing / ${ra.unmatchedReceipts.length} no charge / ${ra.outsidePeriod.length} other period`);

check("27 matched, every one on a WorldFirst line (none on Amex)", ra.matched.length === 27 && ra.matched.every((m) => (lineOf(m.lineIndex).part ?? 0) > 0));
check("every match has equal amount", ra.matched.every((m) => m.receipt.cents === lineOf(m.lineIndex).originalCents));
check("10 supplier invoices matched to their bank transfer",
  ra.matched.filter((m) => lineOf(m.lineIndex).kind === "transfer").map((m) => m.receipt.vendor.split(" ")[0]).sort().join() ===
    "Delgate,Dollar,Dollar,Dollar,FUL-BOX,FULF-BOX-2026-1689,KingsPark,Noons,Shay,Ships");
check("Ships a Lot: each weekly invoice takes its own transfer (10, 17, 21, 26 Aug)",
  ["14725", "14796", "14862", "14931"].map((n) => lineOf(matchOf(new RegExp(n))[0]?.lineIndex ?? -1)?.dateISO).join() ===
    "2026-08-10,2026-08-17,2026-08-21,2026-08-26");
check("FUL-BOX named '$' but paid in EUR is flagged", matchOf(/^FUL-BOX/)[0]?.notes.includes("currency-differs") === true);
check("Anthropic named '$', charged EUR: both matched and flagged",
  matchOf(/^Anthropic/).length === 2 && matchOf(/^Anthropic/).every((m) => m.notes.includes("currency-differs")));
check("'no charge' is exactly Blotato, Heroku Aug01, MongoDB, Uflex",
  ra.unmatchedReceipts.map((r) => r.vendor.split(" ")[0]).sort().join() === "Blotato,Heroku,MongoDB,Återbet");
check("Blotato $20 vs charge $29.00 and MongoDB $223,98 vs $222.45 → amount hints",
  ra.amountHints.map((h) => `${lineOf(h.lineIndex).originalCents}:${h.fileNames.join()}`).sort().join("|") ===
    "22245:MongoDB $223,98 aug-26.pdf|2900:Blotato $20 aug-26.pdf");
check("Noons Memes $387,50 ↔ the 31 Aug transfer to Nantawan Sapsakul (alias), no hints left",
  lineOf(matchOf(/^Noons Memes/)[0]?.lineIndex ?? -1)?.description.startsWith("Transfer-Nantawan Sapsakul") === true &&
    lineOf(matchOf(/^Noons Memes/)[0].lineIndex).dateISO === "2026-08-31" && ra.transferHints.length === 0);
check("HMRC (a July bill) set aside as another period's", ra.outsidePeriod.map((r) => r.vendor).join() === "HMRC GB");
check("transfers are never listed missing", ra.missing.every((i) => lineOf(i).kind === "purchase"));
check("WorldFirst charges still missing a receipt: USD 18 + EUR 1 (Legitify)",
  ra.missing.filter((i) => (lineOf(i).part ?? 0) > 0).length === 19 &&
    ra.missing.some((i) => lineOf(i).description.startsWith("LEGITIFY")));

// ── Her July answers ────────────────────────────────────────────────────────
const july = combineStatements([
  await parseAmexStatement(readFileSync(`${DIR}/amex-statement-2026-08-02.pdf`)),
  await parseWorldFirstStatement(readFileSync(`${DIR}/worldfirst-2026-07.xlsx`), "Worldfirst_2026-07-01_2026-07-31.xlsx"),
  wf.USD, wf.EUR, wf.GBP, wf.CAD,
]);
const JULY = [
  "Hector AI $2295 juli-26 (2).pdf", "Kalowave $129,90 juli-26 (1).pdf", "Jungle scout $99- Jul 21, 2026 (1).pdf",
  "Antrophics $108,90 juli-26 (2).pdf", "Heroku $315,37 juni-26.pdf", "Heroku Jul01 $323,72 juli-26.pdf",
];
const rj = reconcileAmex(july, JULY.map((n) => parseReceiptName(n)!));
const jm = (re: RegExp) => rj.matched.find((m) => re.test(m.receipt.fileName));
const jl = (re: RegExp) => july.lines[jm(re)?.lineIndex ?? -1];
check("all six July receipts matched", rj.matched.length === 6 && rj.unmatchedReceipts.length === 0);
check("Hector AI ↔ RAZ*httpwwwneondigital (8 Jul, USD 2,295)", jl(/^Hector/)?.description.startsWith("RAZ*httpwwwneondigital") === true);
check("Kalowave ↔ KALODATA", jl(/^Kalowave/)?.description.startsWith("KALODATA") === true);
check("Jungle scout $99 ↔ JS API SUBSCRIPTION (21 Jul)", jl(/^Jungle/)?.description.startsWith("JS API") === true && jl(/^Jungle/)?.dateISO === "2026-07-21");
check("Antrophics ↔ ANTHROPIC* CLAUDE SUB, flagged EUR", jl(/^Antrophics/)?.description.startsWith("ANTHROPIC") === true && jm(/^Antrophics/)!.notes.includes("currency-differs"));
check("Heroku $315,37 juni-26 ↔ 6 Jul 'HEROKU* JUN-' (billed later)", jl(/315,37/)?.originalCents === 31537 && jm(/315,37/)!.notes.includes("billed-later"));
check("Heroku Jul01 $323,72 ↔ 5 Aug 'HEROKU* JUL-' on the August PDF (billed later)",
  jl(/323,72/)?.dateISO === "2026-08-05" && jm(/323,72/)!.notes.includes("billed-later"));
check("the typo $315,57 does NOT match", reconcileAmex(july, [parseReceiptName("Heroku $315,57 juni-26.pdf")!]).matched.length === 0);

// ── Aliases stay narrow ─────────────────────────────────────────────────────
check("'Pixel labs' is not hinted against 'NOTION LABS'",
  !reconcileAmex(july, [parseReceiptName("Pixel labs $197 juli-26.pdf")!]).amountHints.length);
check("'Jungle' alias only hits the 'JS' word, not words containing js",
  reconcileAmex(july, [parseReceiptName("Jungle scout $2295 juli-26.pdf")!]).hints.length === 1 &&
    reconcileAmex(july, [parseReceiptName("Jungle scout $2295 juli-26.pdf")!]).matched.length === 0);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);

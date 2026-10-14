/**
 * Verification on Veronica's REAL Project 4 data (received 2026-10-14):
 *
 *   - Amex statements 2026-07-02, 08-02, 09-02 (+ the 10-02 one): every parsed
 *     total must equal the printed "Summan av alla nya köp" (incl. the first
 *     real refund row, Aeo Engine -USD 2,400 on the Aug statement).
 *   - Her July `Amex` folder (Drive ZIP, 45 files) against the 08-02 statement
 *     (period 03.07.26-02.08.26). Expected, checked by hand:
 *       38 matched / 9 missing / 10 receipts with no charge / 4 unreadable.
 *       Google Ads: ONE monthly receipt "$7903,56 juli-26" = 7 x 1,000 + 903.56
 *       (charged Aug 1), Veronica confirmed one invoice per month.
 *       Heroku "$522,24 juni-26" = the June bill charged Jul 6 (billed-later).
 *       SAS → Flysas, "Pirkro 663 kr (lunch ...)", "slack_invoice_$299,83",
 *       "Shopify ... juli-26 BE", "Canva  210 krJuly-26", "Jungle scout $178- Jul 05, 2026".
 *       The 10 unmatched include WorldFirst-card receipts (Kalowave, Capcut,
 *       Anthropic, Klaviyo, Jungle Scout $99) that are not Amex charges.
 *   - The same folder against 07-02: only Leonardo (Jul 2) matches; the other
 *     July receipts are set aside as another period's, not "no charge".
 *   - WorldFirst September export: 67 rows = 41 card purchases + 16 transfers
 *     + 10 TikTok Ads; matching works on it with the same rules.
 *
 * Needs the gitignored files in test-data/project-4/ (personal data).
 * Run: npx tsx scripts/verify-amex-real.mts
 */
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { parseAmexStatement } from "../src/lib/amex/parse";
import { buildReceiptName, parseReceiptName } from "../src/lib/amex/naming";
import { reconcileAmex } from "../src/lib/amex/reconcile";
import { parseWorldFirstStatement } from "../src/lib/amex/worldfirst";
import type { AmexReceipt, AmexStatement } from "../src/lib/amex/types";

const DIR = "test-data/project-4";
const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);

// ── Amex statements ─────────────────────────────────────────────────────────
const statements: Record<string, AmexStatement> = {};
for (const [date, rows, printed] of [
  ["2026-07-02", 44, 11426391],
  ["2026-08-02", 50, 17256162],
  ["2026-09-02", 59, 19095853],
  ["2026-10-02", 60, 24683924],
] as const) {
  const s = await parseAmexStatement(readFileSync(`${DIR}/amex-statement-${date}.pdf`));
  statements[date] = s;
  check(`${date}: ${rows} rows, printed total ${(printed / 100).toFixed(2)} = parsed`, s.lines.length === rows && s.printedPurchasesCents === printed && s.totalsMatch);
}
const refund = statements["2026-08-02"].lines.find((l) => l.kind === "credit");
check("Aug: refund Aeo Engine -USD 2,400 needs no receipt", refund?.originalCents === -240000 && refund.originalCurrency === "USD" && !refund.needsReceipt);

// ── Her July folder ─────────────────────────────────────────────────────────
const zip = await JSZip.loadAsync(readFileSync(`${DIR}/amex-folder-july.zip`));
const names: string[] = [];
zip.forEach((path, entry) => {
  if (!entry.dir) names.push(path.split("/").pop()!);
});
check("July ZIP has 45 files", names.length === 45);
const receipts: AmexReceipt[] = [];
const unreadable: string[] = [];
for (const n of names) {
  const p = parseReceiptName(n);
  if (p) receipts.push(p);
  else unreadable.push(n);
}
check(
  "only 4 names unreadable (no amount or no month, or the statement itself)",
  unreadable.sort().join("|") ===
    ["2026-08-02.pdf", "JUSTCALL Juli-26.pdf", "Kivra_Business_Plus_2026-07-21-2026-08-21 BE.pdf", "Many Chat $25 (3).png"].join("|"),
);

const aug = statements["2026-08-02"];
const r = reconcileAmex(aug, receipts, unreadable);
const lineOf = (re: RegExp) => aug.lines.findIndex((l) => re.test(l.description));
const matchFor = (file: RegExp) => r.matched.filter((m) => file.test(m.receipt.fileName));
console.log(`July folder vs 08-02: ${r.matched.length} matched / ${r.missing.length} missing / ${r.unmatchedReceipts.length} unmatched / ${r.outsidePeriod.length} outside`);
check("08-02: 38 matched / 9 missing / 10 unmatched / 0 outside", r.matched.length === 38 && r.missing.length === 9 && r.unmatchedReceipts.length === 10 && r.outsidePeriod.length === 0);
const gads = matchFor(/^Google ads/);
check(
  "Google Ads monthly receipt covers all 8 charges (7,903.56 incl. Aug 1)",
  gads.length === 8 && gads.every((m) => m.notes.includes("combined") && m.covers === 8) &&
    gads.reduce((a, m) => a + aug.lines[m.lineIndex].originalCents, 0) === 790356,
);
check("Heroku juni-26 matches Jul 6 'Heroku* Jun-...' as billed-later", matchFor(/^Heroku/)[0]?.notes.includes("billed-later") === true);
check("SAS 724 kr ↔ Flysas", aug.lines[matchFor(/^SAS/)[0]?.lineIndex ?? -1]?.description.startsWith("Flysas") === true);
for (const f of [/^Pirkro/, /^slack_invoice/, /^Shopify/, /^Canva/, /^Jungle scout \$178/, /^Open ai \$100 13/]) {
  check(`matched: ${f.source}`, matchFor(f).length === 1);
}
check("Asana/Keepa/Lovable named '$' but charged EUR are flagged", ["Asana", "Keepa", "Lovable"].every((v) => matchFor(new RegExp(`^${v}`))[0]?.notes.includes("currency-differs")));
check("hotel 22364,92 vs charge 20964.51 → amount hint, not a match", r.amountHints.some((h) => h.lineIndex === lineOf(/Hotelcom72076452987559/) && h.fileNames[0].startsWith("sv.hotels.com 22364")));
check(
  "missing list is the real gaps",
  r.missing.map((i) => aug.lines[i].description.split(" ")[0]).sort().join(",") ===
    "Easypark,Easypark,Easypark,Flippa.Com,Hotelcom72076452987559,Kivra+,Lastpass.Com,Leonardo.Ai,Manychat.Com",
);
check("WorldFirst-card receipts are among the unmatched", ["Kalowave", "Capcut", "Anthropics", "Klaviyo"].every((v) => r.unmatchedReceipts.some((x) => x.vendor === v)));

const jul = reconcileAmex(statements["2026-07-02"], receipts, unreadable);
check(
  "07-02: only Leonardo (Jul 2) matches; July receipts set aside, Heroku juni the only unmatched",
  jul.matched.length === 1 && jul.matched[0].receipt.vendor === "Leonardo" &&
    jul.unmatchedReceipts.length === 1 && jul.unmatchedReceipts[0].vendor === "Heroku" && jul.outsidePeriod.length === 39,
);

// ── Naming she confirmed 2026-10-14 ─────────────────────────────────────────
check("build SEK: 'Wispr 150 kr aug-26.pdf'", buildReceiptName({ vendor: "Wispr", cents: 15000, currency: "SEK", dateISO: "2026-08-27", withDay: false }) === "Wispr 150 kr aug-26.pdf");
check("build EUR: 'Lovable €25 aug-26.pdf'", buildReceiptName({ vendor: "Lovable", cents: 2500, currency: "EUR", dateISO: "2026-08-19", withDay: false }) === "Lovable €25 aug-26.pdf");
check("parse 'Wispr 150 kr aug-26.pdf' → SEK 150", (() => {
  const p = parseReceiptName("Wispr 150 kr aug-26.pdf");
  return p?.currency === "SEK" && p.cents === 15000;
})());

// ── WorldFirst ──────────────────────────────────────────────────────────────
const wf = await parseWorldFirstStatement(readFileSync(`${DIR}/worldfirst-2026-09.xlsx`), "Worldfirst receipts 2026-09-01_2026-09-30 (1).xlsx");
const count = (k: string) => wf.lines.filter((l) => l.kind === k).length;
check("WF: 67 rows = 41 purchases + 16 transfers + 10 TikTok Ads", wf.lines.length === 67 && count("purchase") === 41 && count("transfer") === 16 && count("tiktok-ads") === 10);
check("WF: period 2026-09-01 to 2026-09-30 from the file name", wf.periodStartISO === "2026-09-01" && wf.periodEndISO === "2026-09-30" && wf.source === "worldfirst");
check("WF: transaction date from the card reference (posted Sep 1, bought Aug 31)", wf.lines[0].dateISO === "2026-08-31" && wf.lines[0].processDateISO === "2026-09-01");
const wfNames = [
  "Anthropic €420,83 sep-26.pdf",
  "Heroku $327,64 aug-26.pdf",
  "Vadoo $150 Sep7-26.pdf",
  "Vadoo $150 Sep21-26.pdf",
  "Upwork $1584 Sep1-26.pdf",
  "Kalowave $129,90 sep-26.pdf",
];
const wr = reconcileAmex(wf, wfNames.map((n) => parseReceiptName(n)!));
const wfMatch = (re: RegExp) => wr.matched.find((m) => re.test(m.receipt.fileName));
check("WF: Anthropic €420,83 matches the EUR charge", wf.lines[wfMatch(/^Anthropic/)?.lineIndex ?? -1]?.originalCurrency === "EUR");
check("WF: Heroku aug-26 matches 'HEROKU* AUG-...' on Sep 3 (billed-later)", wfMatch(/^Heroku/)?.notes.includes("billed-later") === true);
check("WF: two Vadoo $150 receipts take their own days", wf.lines[wfMatch(/Sep7/)!.lineIndex].dateISO === "2026-09-07" && wf.lines[wfMatch(/Sep21/)!.lineIndex].dateISO === "2026-09-21");
check("WF: Upwork $1584 Sep1 takes the Sep 1 charge, not Sep 30", wf.lines[wfMatch(/^Upwork/)!.lineIndex].dateISO === "2026-09-01");
check("WF: Kalowave vs KALODATA → hint only", wr.hints.some((h) => h.fileNames.includes("Kalowave $129,90 sep-26.pdf")));
check("WF: transfers and TikTok Ads never listed missing", wr.missing.every((i) => wf.lines[i].kind === "purchase"));

console.log("");
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed) process.exit(1);

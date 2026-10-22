/**
 * Verification for checking the Amex statement and the WorldFirst export
 * TOGETHER against one receipt set (Veronica, 2026-10-15: she files a receipt
 * under either card, so "no charge" must mean no charge on ANY statement).
 *
 * Real data (gitignored, test-data/project-4/): the Amex statement 2026-10-02
 * (period 03.09.26-02.10.26) + the WorldFirst September export. Receipts are
 * the Amex set from verify-amex-reconcile.mts plus the WorldFirst set from
 * verify-amex-real.mts, in ONE pile, as she would drop them.
 *
 * Expected: the combined run finds exactly what the two separate runs find
 * (no cross-card false pairs), WorldFirst receipts no longer show as "no
 * charge" next to the Amex statement, each line keeps its card, totals are
 * still checked per statement, and a Google-Ads-style monthly receipt never
 * sums charges from both cards.
 *
 * Run: npx tsx scripts/verify-amex-combined.mts
 */
import { readFileSync } from "node:fs";
import { combineStatements } from "../src/lib/amex/combine";
import { parseReceiptName } from "../src/lib/amex/naming";
import { parseAmexStatement } from "../src/lib/amex/parse";
import { reconcileAmex } from "../src/lib/amex/reconcile";
import { parseWorldFirstStatement } from "../src/lib/amex/worldfirst";
import type { AmexLine, AmexReceipt, AmexStatement } from "../src/lib/amex/types";

const DIR = "test-data/project-4";
const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);

const amex = await parseAmexStatement(readFileSync(`${DIR}/amex-statement-2026-10-02.pdf`));
const wf = await parseWorldFirstStatement(
  readFileSync(`${DIR}/worldfirst-2026-09.xlsx`),
  "Worldfirst receipts 2026-09-01_2026-09-30 (1).xlsx",
);

const AMEX_NAMES = [
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
];
const WF_NAMES = [
  "Anthropic €420,83 sep-26.pdf",
  "Heroku $327,64 aug-26.pdf",
  "Vadoo $150 Sep7-26.pdf",
  "Vadoo $150 Sep21-26.pdf",
  "Upwork $1584 Sep1-26.pdf",
  "Kalowave $129,90 sep-26.pdf",
];
const parse = (names: string[]) => names.map((n) => parseReceiptName(n)!);
const keyOf = (s: AmexStatement, i: number) => {
  const l = s.lines[i];
  return `${l.dateISO}|${l.originalCents}|${l.originalCurrency}|${l.description}`;
};

// Separate runs, as today: each statement against ALL receipts.
const all = [...parse(AMEX_NAMES), ...parse(WF_NAMES)];
const ra = reconcileAmex(amex, all);
const rw = reconcileAmex(wf, all);

// The combined run.
const both = combineStatements([amex, wf]);
const rc = reconcileAmex(both, all);
const line = (i: number): AmexLine => both.lines[i];

console.log(`Amex alone: ${ra.matched.length} matched / ${ra.missing.length} missing / ${ra.unmatchedReceipts.length} no charge`);
console.log(`WF alone:   ${rw.matched.length} matched / ${rw.missing.length} missing / ${rw.unmatchedReceipts.length} no charge`);
console.log(`Together:   ${rc.matched.length} matched / ${rc.missing.length} missing / ${rc.unmatchedReceipts.length} no charge / ${rc.outsidePeriod.length} outside`);
console.log("No charge on either card:", rc.unmatchedReceipts.map((r) => r.fileName));

check("lines = Amex + WorldFirst, each tagged with its card", both.lines.length === amex.lines.length + wf.lines.length &&
  both.lines.every((l, i) => l.part === (i < amex.lines.length ? 0 : 1)));
check("source 'combined', period = union, each part's period kept", both.source === "combined" &&
  both.periodStartISO === "2026-09-01" && both.periodEndISO === "2026-10-02" &&
  JSON.stringify(both.periods) === JSON.stringify([["2026-09-03", "2026-10-02"], ["2026-09-01", "2026-09-30"]]));
check("totals check carried over (Amex total exact)", amex.totalsMatch && both.totalsMatch);

const pairs = (s: AmexStatement, r: typeof rc) => r.matched.map((m) => `${keyOf(s, m.lineIndex)}<-${m.receipt.fileName}`).sort();
check("matched together = Amex matches + WorldFirst matches, same pairs",
  JSON.stringify(pairs(both, rc)) === JSON.stringify([...pairs(amex, ra), ...pairs(wf, rw)].sort()));
check("missing together = Amex missing + WorldFirst missing",
  JSON.stringify(rc.missing.map((i) => keyOf(both, i)).sort()) ===
    JSON.stringify([...ra.missing.map((i) => keyOf(amex, i)), ...rw.missing.map((i) => keyOf(wf, i))].sort()));
check("Amex receipts match Amex lines, WorldFirst receipts match WorldFirst lines",
  rc.matched.every((m) => (AMEX_NAMES.includes(m.receipt.fileName) ? 0 : 1) === line(m.lineIndex).part));

const amexNoCharge = new Set(ra.unmatchedReceipts.map((r) => r.fileName));
check("alone, the Amex run lists WorldFirst receipts (Anthropic, Vadoo x2) as 'no charge'",
  ["Anthropic €420,83 sep-26.pdf", "Vadoo $150 Sep7-26.pdf", "Vadoo $150 Sep21-26.pdf"].every((n) => amexNoCharge.has(n)));
check("together, 'no charge' = only receipts with no charge on EITHER card",
  rc.unmatchedReceipts.map((r) => r.fileName).sort().join("|") ===
    ["Channel $49 sep-26.pdf", "Heroku $532,10 sep-26.pdf", "Twillio $90,10 sep-26.pdf"].sort().join("|"));
// Kalowave = KALODATA, confirmed by Veronica 2026-10-22 (was only a hint before).
check("Kalowave matches KALODATA, on the WorldFirst line",
  rc.matched.some((m) => m.receipt.fileName === "Kalowave $129,90 sep-26.pdf" && line(m.lineIndex).part === 1));
check("Heroku aug-26 still billed-later on WorldFirst",
  rc.matched.find((m) => m.receipt.fileName === "Heroku $327,64 aug-26.pdf")?.notes.includes("billed-later") === true);
check("no receipt used twice, no charge matched twice",
  new Set(rc.matched.filter((m) => !m.notes.includes("combined")).map((m) => m.receipt.fileName)).size ===
    rc.matched.filter((m) => !m.notes.includes("combined")).length &&
    new Set(rc.matched.map((m) => m.lineIndex)).size === rc.matched.length);

// One statement passes through unchanged (the page's single-statement path).
const single = combineStatements([amex]);
const rs = reconcileAmex(single, all);
check("one statement: same result as before, lines tagged part 0",
  single.source === "amex" && single.periods === undefined && single.lines.every((l) => l.part === 0) &&
    JSON.stringify(pairs(single, rs)) === JSON.stringify(pairs(amex, ra)) && rs.missing.length === ra.missing.length);

// A monthly receipt must not add up charges from BOTH cards. Synthetic: one
// Acme USD 600 charge on each card in September; an "Acme $1200 sep-26"
// receipt would only fit by mixing cards, so it must stay unmatched.
const acme = (src: AmexStatement, day: string): AmexStatement => ({
  ...src,
  lines: [{ ...src.lines[0], dateISO: `2026-09-${day}`, processDateISO: `2026-09-${day}`, description: "ACME TOOLS",
    sekCents: 0, originalCents: 60000, originalCurrency: "USD", feeSekCents: 0, kind: "purchase", needsReceipt: true }],
});
const mixed = combineStatements([acme(amex, "10"), acme(wf, "12")]);
const rm = reconcileAmex(mixed, [parseReceiptName("Acme $1200 sep-26.pdf")!]);
check("a monthly receipt never sums charges across cards", rm.matched.length === 0 && rm.missing.length === 2);
const sameCard: AmexStatement = { ...acme(amex, "10"), lines: [...acme(amex, "10").lines, ...acme(amex, "20").lines] };
const rsc = reconcileAmex(combineStatements([sameCard, acme(wf, "12")]), [parseReceiptName("Acme $1200 sep-26.pdf")!]);
check("…but still sums them on one card", rsc.matched.length === 2 && rsc.matched.every((m) => m.notes.includes("combined")));

// Period gaps: Amex June-July statement + WorldFirst September. An "aug-26"
// receipt is in neither period, so it is set aside, not "no charge", even
// though August lies between the two.
const jun = await parseAmexStatement(readFileSync(`${DIR}/amex-statement-2026-07-02.pdf`));
const gap = reconcileAmex(combineStatements([jun, wf]), [parseReceiptName("Zendesk $115 aug-26.pdf")!]);
check("a receipt in the gap between two periods is set aside as another period's",
  gap.outsidePeriod.length === 1 && gap.unmatchedReceipts.length === 0);

console.log("");
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);

/**
 * WorldFirst totals by type (Veronica 2026-11-09: "it is never the grand total; it consists of specific
 * types of purchases, such as the total for Google Ads, TikTok Ads, Facebook ads").
 *
 * Real data, gitignored in test-data/project-4/: her multi-currency statement PDFs for Sep and Oct 2026
 * (worldfirst-multi-2026-09.pdf / -10.pdf, "Statement for Multi-currency account", no printed summary)
 * and her Sep .xlsx export (worldfirst-2026-09.xlsx).
 *
 * Expected figures were computed INDEPENDENTLY (Python + pypdf flat text, direction from the change of
 * the running balance per currency, not from column positions) on 2026-11-09, not copied from this code.
 *
 * Run: npx tsx scripts/verify-worldfirst-types.mts
 */
import { readFileSync } from "node:fs";
import { balanceChainBreaks, parseWorldFirstPdf, parseWorldFirstStatement } from "../src/lib/amex/worldfirst";
import { breakdownByType, typeOf } from "../src/lib/worldfirst/by-type";

const DIR = "test-data/project-4";
const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);
const total = (b: ReturnType<typeof breakdownByType>, key: string, cur: string) =>
  b.groups.find((g) => g.key === key)?.totals.find((t) => t.currency === cur);

const sep = await parseWorldFirstPdf(readFileSync(`${DIR}/worldfirst-multi-2026-09.pdf`));
const oct = await parseWorldFirstPdf(readFileSync(`${DIR}/worldfirst-multi-2026-10.pdf`));
check("Sep: 109 rows, every row matches the running balance", sep.lines.length === 109 && sep.totalsMatch);
check("Oct: 194 rows, every row matches the running balance", oct.lines.length === 194 && oct.totalsMatch);
check("periods from the statement", sep.periodStartISO === "2026-09-01" && oct.periodEndISO === "2026-10-31");
const sb = breakdownByType(sep);
const ob = breakdownByType(oct);

// Independent figures (cents).
check("Sep TikTok Ads USD 11,605.85 out, 10 rows", total(sb, "tiktok-ads", "USD")?.outCents === 1160585 && total(sb, "tiktok-ads", "USD")?.count === 10);
check("Sep TikTok Shop payouts USD 3,407.41 in, 5 rows", total(sb, "tiktok-shop", "USD")?.inCents === 340741 && total(sb, "tiktok-shop", "USD")?.count === 5);
check("Sep no Google Ads / Facebook ads on WorldFirst", !sb.groups.find((g) => g.key === "google-ads")!.lines.length && !sb.groups.find((g) => g.key === "facebook-ads")!.lines.length);
check("Oct Google Ads USD 15,000.00 out, 15 rows", total(ob, "google-ads", "USD")?.outCents === 1500000 && total(ob, "google-ads", "USD")?.count === 15);
check("Oct TikTok Ads USD 15,062.72 out, 4 rows", total(ob, "tiktok-ads", "USD")?.outCents === 1506272 && total(ob, "tiktok-ads", "USD")?.count === 4);
check("Oct Facebook ads EUR 7,768.58 out (37 charges)", total(ob, "facebook-ads", "EUR")?.outCents === 776858);
check("Oct Facebook ads SEK 226.40 out, 7 rows", total(ob, "facebook-ads", "SEK")?.outCents === 22640 && total(ob, "facebook-ads", "SEK")?.count === 7);
check("Oct TikTok Shop payouts USD 6,372.21 in, 4 rows", total(ob, "tiktok-shop", "USD")?.inCents === 637221 && total(ob, "tiktok-shop", "USD")?.count === 4);
// Sep money out per currency = the figures already confirmed from her Sep export (sent to her 2026-11-09).
const out = (s: typeof sep, c: string) => s.lines.filter((l) => l.originalCurrency === c && l.originalCents > 0).reduce((a, l) => a + l.originalCents, 0);
check("Sep money out USD 808,683.07 / EUR 17,405.80 / GBP 2,682.36", out(sep, "USD") === 80868307 && out(sep, "EUR") === 1740580 && out(sep, "GBP") === 268236);

// Refunds printed without a merchant: 32 in Oct (EUR 3,913.38 + USD 1,685.06), 10 paired on exact amount.
const blank = oct.lines.filter((l) => !l.description);
check("Oct 32 money-in rows without merchant text", blank.length === 32 && blank.every((l) => l.originalCents < 0));
const paired = ob.groups.flatMap((g) => g.lines).filter((l) => l.refundOf);
check("10 paired with a charge of the exact same amount + currency", paired.length === 10 && paired.every((l) => ob.groups.some((g) => g.lines.some((c) => c.cents === -l.cents && c.currency === l.currency && c.description === l.refundOf!.description))));
check("7 of them are Facebook ads (EUR 1,331.11 back)", total(ob, "facebook-ads", "EUR")?.inCents === 133111 && ob.groups.find((g) => g.key === "facebook-ads")!.lines.filter((l) => l.refundOf).length === 7);
const unm = ob.groups.find((g) => g.category === "refund-unmatched")!;
check("22 not paired stay on their own: EUR 2,582.27", unm.lines.length === 22 && total(ob, "refund-unmatched", "EUR")?.inCents === 258227);
check("every row is in exactly one group", ob.groups.reduce((a, g) => a + g.lines.length, 0) === 194 && sb.groups.reduce((a, g) => a + g.lines.length, 0) === 109);

// Sep PDF vs Sep .xlsx export: every money-out type the same (the export has no CAD conversion).
const xl = breakdownByType(await parseWorldFirstStatement(readFileSync(`${DIR}/worldfirst-2026-09.xlsx`), "x_2026-09-01_2026-09-30.xlsx"));
const outs = (b: typeof sb) => new Map(b.groups.flatMap((g) => g.totals.filter((t) => t.outCents).map((t) => [`${g.key}|${t.currency}`, `${t.outCents}/${t.count}`] as const)));
const [a, b] = [outs(sb), outs(xl)];
const diffs = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
check("Sep PDF = Sep export for all 44 shared money-out types (only diff: CAD conversion)", diffs.length === 1 && diffs[0] === "conversion:cad -> usd|CAD" && a.size === 45);

// Oct StatementDetail export (Veronica 2026-11-10, worldfirst-detail-2026-10.xlsx). Expected figures from
// Python/openpyxl on 2026-11-11 (each refund's "Remarks" looked up among the card payments), not from this code.
const det = await parseWorldFirstStatement(readFileSync(`${DIR}/worldfirst-detail-2026-10.xlsx`), "2125170000074573_2026-10-01_2026-10-31 (2).xlsx");
const db = breakdownByType(det);
check("Oct detail: 194 rows, every row matches its Balance column", det.lines.length === 194 && det.totalsMatch && det.balanceChecked === true);
check("Oct detail: verified + detail flags (PDF: verified, no detail)", db.verified && db.detail && !ob.detail && ob.verified);
check("Oct detail: all 32 refunds linked by reference, none left unmatched", db.linkedRefunds === 32 && !db.groups.some((g) => g.category === "refund-unmatched"));
check("Oct detail Facebook ads: EUR 7,768.58 out, EUR 3,913.38 back (29 refunds), SEK 226.40 out",
  total(db, "facebook-ads", "EUR")?.outCents === 776858 && total(db, "facebook-ads", "EUR")?.inCents === 391338 &&
  db.groups.find((g) => g.key === "facebook-ads")!.lines.filter((l) => l.refundOf?.how === "reference").length === 29 &&
  total(db, "facebook-ads", "SEK")?.outCents === 22640);
check("Oct detail: the other 3 refunds sit under OpenAI USD 50.00, SP Sleeve Stars USD 17.06, Pattern USD 1,618.00",
  total(db, "card:openai san francisco usa", "USD")?.inCents === 5000 &&
  total(db, "card:sp sleeve stars estero usa", "USD")?.inCents === 1706 &&
  total(db, "card:pattern inc lehi usa", "USD")?.inCents === 161800);
check("Oct detail EUR 173.80 (27 Oct) = money back on FACEBK *FLE28D2MG4 of 26 Oct", db.groups.find((g) => g.key === "facebook-ads")!.lines.some(
  (l) => l.cents === -17380 && l.dateISO === "2026-10-27" && l.refundOf?.dateISO === "2026-10-26" && l.refundOf.description.startsWith("FACEBK *FLE28D2MG4")));
// Money out per type and currency (refund rows differ by design: the PDF pairs 10 by amount, the export links all 32).
// Keys without spaces: the PDF wraps "Belastingdienst,Apeldoorn,the Netherlands" where the export has "theNetherlands".
const outOnly = (x: typeof ob) => new Map(x.groups.flatMap((g) => g.totals.filter((t) => t.outCents).map((t) => [`${g.key}|${t.currency}`.replace(/\s+/g, ""), t.outCents] as const)));
const [po, dout] = [outOnly(ob), outOnly(db)];
const outDiffs = [...new Set([...po.keys(), ...dout.keys()])].filter((k) => po.get(k) !== dout.get(k));
check(`Oct PDF = Oct detail export: money out of all ${po.size} types identical`, outDiffs.length === 0 && po.size === dout.size && po.size > 40);
check("Oct detail Google Ads USD 15,000.00 (15) and TikTok Ads USD 15,062.72 (4)",
  total(db, "google-ads", "USD")?.outCents === 1500000 && total(db, "google-ads", "USD")?.count === 15 &&
  total(db, "tiktok-ads", "USD")?.outCents === 1506272 && total(db, "tiktok-ads", "USD")?.count === 4);
check("short export: not verified, no detail, no links", !xl.verified && !xl.detail && xl.linkedRefunds === 0);
check("PDF refunds still paired by amount (10)", ob.groups.flatMap((g) => g.lines).filter((l) => l.refundOf?.how === "amount").length === 10);

// Pure pieces.
check("chain: a tampered amount breaks it", balanceChainBreaks([
  { currency: "USD", inCents: 0, outCents: 100, balanceCents: 900 },
  { currency: "EUR", inCents: 50, outCents: 0, balanceCents: 50 },
  { currency: "USD", inCents: 0, outCents: 200, balanceCents: 750 },
]).join() === "2");
check("chain: a row without balance breaks it", balanceChainBreaks([{ currency: "USD", inCents: 1, outCents: 0, balanceCents: null }]).join() === "0");
check("types", [
  ["GOOGLE *ADS7169976525 DUBLIN 4 IRL", "google-ads"], ["GOOGLE*ADS7169976525 CC GOOGLE.COM IRL", "google-ads"],
  ["TIKTOK ADS CULVER CITY USA", "tiktok-ads"], ["TikTok Ads Culver City USA", "tiktok-ads"],
  ["FACEBK *DVK229EMG4 fb.me/ads IRL", "facebook-ads"], ["Collection-BD TikTok USA LLC", "tiktok-shop"],
  ["TikTok Shop CULVER CITY USA", "card:tiktok shop culver city usa"], ["Google CLOUD RH557H Dublin IRL", "card:google cloud rh557h dublin irl"],
  ["Collection-AMAZON.CQWUGPEKW", "payout:amazon"], ["Transfer-Delgate Logistics LTD(4002242)", "transfer:delgate logistics ltd"],
  ["HEROKU* SEP-114103281 SAN FRANCISCO USA", "card:heroku* san francisco usa"], ["21ST.DEV DOVER USA", "card:21st.dev dover usa"],
].every(([d, k]) => typeOf(d, 100).key === k));

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(failed ? `\n❌ ${failed} of ${checks.length} failed.` : `\n${checks.length}/${checks.length} passed`);
process.exit(failed ? 1 : 0);

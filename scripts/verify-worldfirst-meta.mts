/**
 * Facebook ads: WorldFirst StatementDetail export vs Meta's billing report (Veronica 2026-11-10).
 *
 * Real data, gitignored in test-data/project-4/: worldfirst-detail-2026-10.xlsx (her Oct export) and
 * meta-billing-2026-10.pdf (Meta's Oct billing report, from Exelle).
 *
 * Expected figures were computed INDEPENDENTLY on 2026-11-11 (Python: openpyxl for the export, pdfplumber flat
 * text for Meta's rows), not copied from this code:
 *   Meta: 44 rows in the main list = SEK 46,728.25 printed; Ad credit section 1 row SEK 0.01 printed.
 *   Mastercard ···· 9556 (the WorldFirst card): 36 rows, SEK 39,844.88. American Express ···· 2008: 5 rows,
 *   SEK 4,979.71. "N/A": 3 rows (SEK 609.66, 1,294.01, refund -0.01).
 *   WorldFirst: 44 FACEBK charges, all card 9556, all charged in SEK; 7 refunded in full; 31 Oct
 *   FACEBK *2ZKNWD6MG4 (SEK 3,084.53, "Partially refund") has its refund after October.
 *   Oct 6 FACEBK *MKP29A2MG4: SEK 2,275.00, "Partially refund", no refund row (SEK 0.01 is under one euro cent);
 *   Meta 07/10 SEK 2,274.99 + Meta's own "-SEK0.01" refund row.
 *
 * Run: npx tsx scripts/verify-worldfirst-meta.mts
 */
import { readFileSync } from "node:fs";
import { parseWorldFirstStatement, parseWorldFirstPdf } from "../src/lib/amex/worldfirst";
import { extractPdfItems, extractPdfText } from "../src/lib/pdf";
import { isMetaBillingText, metaAmount, parseMetaBilling, parseMetaBillingItems, reconcileMeta } from "../src/lib/worldfirst/meta-billing";

const DIR = "test-data/project-4";
const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);
const sum = (xs: { cents: number }[]) => xs.reduce((s, x) => s + x.cents, 0);

const metaBytes = readFileSync(`${DIR}/meta-billing-2026-10.pdf`);
const report = await parseMetaBilling(metaBytes);
check("Meta report recognised", isMetaBillingText(await extractPdfText(metaBytes)));
check("Meta period 2026-10-01 .. 2026-11-01, SEK, account 2154196434898773",
  report.periodStartISO === "2026-10-01" && report.periodEndISO === "2026-11-01" && report.currency === "SEK" && report.account === "2154196434898773");
check("Meta: 45 rows; main list 44 = printed SEK 46,728.25; Ad credit 1 = printed SEK 0.01",
  report.lines.length === 45 && report.sections.length === 2 &&
  report.sections[0].count === 44 && report.sections[0].printedCents === 4672825 && report.sections[0].parsedCents === 4672825 &&
  report.sections[1].method === "Ad credit" && report.sections[1].count === 1 && report.sections[1].printedCents === 1 && report.totalsMatch);
const by = (last4: string | null) => report.lines.filter((l) => l.cardLast4 === last4);
check("Meta card 9556: 36 rows, SEK 39,844.88", by("9556").length === 36 && sum(by("9556")) === 3984488);
check("Meta Amex 2008: 5 rows, SEK 4,979.71", by("2008").length === 5 && sum(by("2008")) === 497971 && by("2008").every((l) => l.method === "American Express ···· 2008"));
const na = report.lines.filter((l) => l.method === "N/A");
check("Meta N/A: 3 rows (609.66, 1,294.01, -0.01 refund)", na.length === 3 && na.map((l) => l.cents).sort((a, b) => a - b).join() === "-1,60966,129401");
check("Meta row 31/10 SEK 84.53: full transaction ID, Paid", report.lines[0].dateISO === "2026-10-31" && report.lines[0].cents === 8453 &&
  report.lines[0].transactionId === "29573437299009951-29841982845488720" && report.lines[0].status === "Paid");

const st = await parseWorldFirstStatement(readFileSync(`${DIR}/worldfirst-detail-2026-10.xlsx`), "x_2026-10-01_2026-10-31.xlsx");
const rec = reconcileMeta(st, report);
check("WorldFirst Facebook charges on card 9556 only", rec.cards.join() === "9556");
check("36 matched = every Meta row on card 9556, each once", rec.matched.length === 36 && rec.metaWithoutCharge.length === 0 &&
  new Set(rec.matched.map((m) => m.meta.transactionId)).size === 36 && rec.totals.matchedMetaCents === 3984488 && rec.totals.metaOnCardsCents === 3984488);
check("every match within one euro cent in SEK (max 7 öre), exact ones to the öre",
  rec.matched.every((m) => Math.abs(m.diffCents) <= 7) && rec.matched.filter((m) => !m.charge.estimated && !m.charge.tinyRefund).every((m) => m.diffCents === 0));
check("dates: Meta 1 day before to 2 days after", rec.matched.every((m) => m.dayDiff >= -1 && m.dayDiff <= 2));
check("7 charges refunded in full (not on Meta)", rec.fullyRefunded.length === 7 && rec.fullyRefunded.every((c) => c.refundedCents === c.accountCents));
check("1 refund after October: 31 Oct FACEBK *2ZKNWD6MG4 SEK 3,084.53", rec.refundPending.length === 1 &&
  rec.refundPending[0].dateISO === "2026-10-31" && rec.refundPending[0].description.startsWith("FACEBK *2ZKNWD6MG4") && rec.refundPending[0].chargedCents === 308453);
const tiny = rec.matched.filter((m) => m.charge.tinyRefund);
check("6 Oct MKP29A2MG4 SEK 2,275.00 -> Meta 07/10 SEK 2,274.99 (refund under one euro cent)", tiny.length === 1 &&
  tiny[0].charge.description.startsWith("FACEBK *MKP29A2MG4") && tiny[0].meta.dateISO === "2026-10-07" && tiny[0].meta.cents === 227499 && tiny[0].diffCents === -1);
check("44 charges = 36 matched + 7 refunded in full + 1 pending, nothing else open",
  rec.matched.length + rec.fullyRefunded.length + rec.refundPending.length === 44 && !rec.chargesWithoutMeta.length && !rec.otherCurrency.length);
check("Meta paid another way: 5 Amex + 3 N/A + Ad credit = 9 rows, SEK 6,883.38",
  rec.metaOtherPayment.length === 9 && sum(rec.metaOtherPayment) === 497971 + 60966 + 129401 - 1 + 1);
check("27 Oct EUR 173.80 refund: FLE28D2MG4 SEK 2,666.00, EUR 240.20 - 173.80 kept -> Meta 27/10 SEK 736.93", rec.matched.some((m) =>
  m.charge.description.startsWith("FACEBK *FLE28D2MG4") && m.charge.chargedCents === 266600 && m.charge.refundedCents === 17380 &&
  m.meta.dateISO === "2026-10-27" && m.meta.cents === 73693));

// Guards.
let threw = "";
try {
  reconcileMeta(await parseWorldFirstPdf(readFileSync(`${DIR}/worldfirst-multi-2026-10.pdf`)), report);
} catch (e) {
  threw = e instanceof Error ? e.message : String(e);
}
check("the PDF statement is refused (no refund links, no SEK)", threw.includes(".xlsx export"));
const tampered = parseMetaBillingItems(
  (await extractPdfItems(metaBytes)).map((i) => (i.str === "SEK84.53" ? { ...i, str: "SEK84.54" } : i)),
);
check("a changed Meta amount fails the printed-total check", !tampered.totalsMatch);
check("amount reader", metaAmount("SEK2,094.00")?.join() === "209400,SEK" && metaAmount("-SEK0.01")?.join() === "-1,SEK" && metaAmount("Paid") === null);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(failed ? `\n❌ ${failed} of ${checks.length} failed.` : `\n${checks.length}/${checks.length} passed`);
process.exit(failed ? 1 : 0);

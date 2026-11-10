/**
 * Fortnox SIE from an Amex statement: rebuild Veronica's OWN voucher A 1118 (real data, gitignored):
 *   test-data/project-4/fortnox-A1118.pdf          her Fortnox voucher, booked 2026-08-31 (sent 2026-11-10)
 *   test-data/project-4/amex-statement-2026-09-02.pdf  the Amex statement it books (2026-08-03..2026-09-02)
 * The voucher is read here with its own simple parser (not the platform's code). Expected: every line we book is
 * booked exactly as she did (account totals to the öre), and the only lines left for her are the travel ones she
 * decided by hand (Awardfares -> 5810, Hotel Nittra -> 1667).
 *
 * Run: npx tsx scripts/verify-amex-sie.mts
 */
import { readFileSync } from "node:fs";
import { extractPdfText } from "../src/lib/pdf";
import { parseAmexStatement } from "../src/lib/amex/parse";
import { buildVoucher, decide, defaultVoucherDate, quarter, sieText, toCp437 } from "../src/lib/amex/sie";

const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);
const D = "test-data/project-4";

// --- her voucher, parsed independently: account -> total öre (debit +, credit -) ---
// Each voucher row is "NNNN <account name> [<line text>] <amount>". Account names contain "25 %" / "25%", so those
// are removed first; then an account number, letters only, and the first "1 234,56" amount make one row.
const flat = (await extractPdfText(readFileSync(`${D}/fortnox-A1118.pdf`)))
  .split("Antal verifikat")[0]
  .replace(/\s+/g, " ")
  .replace(/25 ?%/g, "");
const her = new Map<string, number>();
const CREDIT = new Set(["2614", "1681"]);
for (const m of flat.matchAll(/(?:^| )(\d{4}) ([^\d]*?)(\d{1,3}(?: \d{3})*,\d{2})(?= |$)/g)) {
  const ore = Math.round(Number(m[3].replace(/ /g, "").replace(",", ".")) * 100);
  her.set(m[1], (her.get(m[1]) ?? 0) + (CREDIT.has(m[1]) ? -ore : ore));
}
const herTotal = [...her.values()].reduce((a, b) => a + b, 0);
console.log("her voucher accounts:", Object.fromEntries([...her].map(([a, o]) => [a, o / 100])));
check("her voucher balances (debit = credit)", herTotal === 0);
check("her voucher: Amex 1681 credit 190,958.53", her.get("1681") === -19095853);

// --- rebuild from the statement ---
const st = await parseAmexStatement(readFileSync(`${D}/amex-statement-2026-09-02.pdf`));
check("statement 2026-08-03..2026-09-02", st.periodStartISO === "2026-08-03" && st.periodEndISO === "2026-09-02");
check("statement lines add up to its printed total (the route refuses otherwise)", st.totalsMatch === true);
const date = defaultVoucherDate(st.statementDateISO);
check("voucher date = 2026-08-31 (as A 1118)", date === "2026-08-31");
const v = buildVoucher(st, { dateISO: date });
const ours = new Map<string, number>();
for (const t of v.trans) ours.set(t.account, (ours.get(t.account) ?? 0) + t.ore);
console.log("our voucher accounts:", Object.fromEntries([...ours].map(([a, o]) => [a, o / 100])));

const forYou = v.decisions.filter((d) => d.status === "for-you");
console.log("left for her:", forYou.map((d) => `${d.line.description} ${(d.line.sekCents / 100).toFixed(2)} | ${d.reason}`));
check("left for her = only the 2 travel lines (Awardfares, hotel)",
  forYou.length === 2 && forYou.some((d) => /awardfares/i.test(d.line.description)) && forYou.some((d) => /hotel/i.test(d.line.description)));
const awardfares = forYou.find((d) => /awardfares/i.test(d.line.description))!.line.sekCents;
const hotel = forYou.find((d) => /hotel/i.test(d.line.description))!.line.sekCents;
check("those 2 are exactly her 5810 and 1667 lines", awardfares === her.get("5810") && hotel === her.get("1667"));
check("not in voucher = only the payment to Amex",
  v.decisions.filter((d) => d.status === "not-in-voucher").every((d) => d.line.kind === "payment"));

for (const acct of ["4531", "4524", "6551", "2645", "2614", "5420", "2641", "6570"]) {
  check(`account ${acct} = hers to the öre (${((her.get(acct) ?? 0) / 100).toFixed(2)})`, ours.get(acct) === her.get(acct));
}
check("1681 credit = her 1681 minus the 2 travel lines", ours.get("1681") === (her.get("1681") ?? 0) + awardfares + hotel);
check("our voucher balances", v.trans.reduce((n, t) => n + t.ore, 0) === 0);
check("booked + for her = all purchases + fee", v.bookedOre + v.forYouOre === 19095853);
check("no account we book that she did not use", [...ours.keys()].every((a) => her.has(a)));

// --- rules on single lines ---
const line = (description: string, sekCents: number, originalCurrency = "USD", kind = "purchase") =>
  ({ dateISO: "2026-08-01", processDateISO: "2026-08-01", description, sekCents, originalCents: sekCents,
     originalCurrency, feeSekCents: 0, kind, needsReceipt: true }) as never;
check("rule: Google Ads -> 4524", decide(line("Google *Ads7169976525 Cc@google.Com", 100)).account === "4524");
check("rule: other Google -> 4531", decide(line("Google Cloud Dublin", 100)).account === "4531");
check("rule: unknown merchant -> for her", decide(line("Some New Tool Inc", 100)).status === "for-you");
check("rule: a known foreign SaaS charged in SEK -> 4531 reverse charge (as Adobe/Canva/Wispr in A 1118)",
  decide(line("Canva Ireland Limited Dublin", 21000, "SEK")).account === "4531" && decide(line("Canva Ireland Limited Dublin", 21000, "SEK")).vat === "rc25");
check("rule: Kivra in SEK -> 5420 + Swedish VAT", decide(line("Kivra+ Stockholm", 12375, "SEK")).vat === "se25");
check("rule: hotel -> for her", decide(line("Hotels.com Booking", 100)).status === "for-you");
check("rule: refund -> for her", decide(line("Shopify refund", -100, "USD", "credit")).status === "for-you");
check("VAT 25 % half up: 1 915,18 -> 478,80", quarter(191518) === 47880);
check("VAT 25 % half up: 987,66 -> 246,92", quarter(98766) === 24692);

// --- the file ---
const text = sieText(v, { orgNr: "559055-1502", name: "Burman Enterprise AB" }, "2026-11-10");
check("SIE: one #VER, series A, date 20260831", /#VER A "" 20260831 "Amex 2026-08-03 - 2026-09-02"/.test(text));
check("SIE: 1681 credit line", text.includes(`#TRANS 1681 {} -${((19095853 - awardfares - hotel) / 100).toFixed(2)}`));
check("SIE: CRLF line endings", text.includes("\r\n") && !/[^\r]\n/.test(text));
const bytes = toCp437("Årsavgift för kontot");
check("SIE: PC8 encoding of Å/ö", bytes[0] === 0x8f && bytes.includes(0x94));
check("SIE: every #TRANS amount has 2 decimals", text.split("\r\n").filter((l) => l.includes("#TRANS")).every((l) => /\{\} -?\d+\.\d{2} /.test(l)));

// --- the statement she sent on 2026-11-10 (not booked by her yet in what we have): coverage only ---
const oct = await parseAmexStatement(readFileSync(`${D}/amex-statement-2026-10-02.pdf`));
const vo = buildVoucher(oct, { dateISO: defaultVoucherDate(oct.statementDateISO) });
const left = vo.decisions.filter((d) => d.status === "for-you");
console.log(`\nOct statement ${oct.periodStartISO}..${oct.periodEndISO}: booked ${(vo.bookedOre / 100).toFixed(2)} SEK in ${vo.decisions.filter((d) => d.status === "booked").length} lines; for her ${left.length} lines ${(vo.forYouOre / 100).toFixed(2)} SEK:`);
for (const d of left) console.log(`   ${d.line.dateISO} ${(d.line.sekCents / 100).toFixed(2)} ${d.line.description} | ${d.reason}`);
check("Oct voucher balances", vo.trans.reduce((n, t) => n + t.ore, 0) === 0);
check("Oct statement lines add up to its printed total", oct.totalsMatch === true);
check("Oct: booked + for her + payments = all lines",
  vo.decisions.every((d) => ["booked", "for-you", "not-in-voucher"].includes(d.status)));

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} pass`);
process.exit(failed ? 1 : 0);

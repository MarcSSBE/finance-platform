/**
 * Amazon payout statements (Veronica 2026-11-10: name them with the country + payout amount).
 *
 * Real data, gitignored: test-data/project-3/payouts/Amazon/DE/Statement View.pdf = her DE "Payment statement"
 * (Charlie, "Microsoft: Print To PDF", NO text layer). Expected figures were read by hand from the page image
 * on 2026-11-10, not from this code: settlement 28/09/2026 - 12/10/2026, beginning balance 0.00, sales 54,388.87,
 * refunds -5,450.05, expenses -41,966.09, net proceeds 6,972.73 = transfer on 12/10/2026 (WorldFirst shows it on
 * 13 Oct 2026 as "Collection-AMAZON PAYMENTS EUROPE S.C.A." 6972.73 EUR).
 *
 * Run: npx tsx scripts/verify-amazon-payouts.mts   (the real-file part needs ANTHROPIC_API_KEY in .env)
 */
import { readFileSync } from "node:fs";
import {
  classifyAndReadPayout, countryFromPath, isoToSimpleDate, payoutProblem, resolveCurrency, type PayoutRead,
} from "../src/lib/amazon/payout";
import { buildAmazonName } from "../src/lib/amazon/naming";

const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);

// --- country only from the folder ---
check("country: Amazon/DE/file -> DE", countryFromPath("Amazon/DE/Statement View.pdf") === "DE");
check("country: nearest folder wins", countryFromPath("Accounting/Amazon/FR/Statement View/x.pdf") === "FR");
check("country: lower case folder", countryFromPath("amazon/de/x.pdf") === "DE");
check("country: Windows path", countryFromPath("Amazon\\IT\\x.pdf") === "IT");
check("country: none for a loose file", countryFromPath("Statement View.pdf") === "");
check("country: not from the file name", countryFromPath("Amazon/DE.pdf") === "");
check("country: 'Amazon' folder is not a country", countryFromPath("x/Amazon/y.pdf") === "");

// --- currency from what is printed ---
check("currency € -> EUR", resolveCurrency("€", "DE") === "EUR");
check("currency £ -> GBP", resolveCurrency("£", "UK") === "GBP");
check("currency $ + US -> USD", resolveCurrency("$", "US") === "USD");
check("currency $ + CA -> CAD", resolveCurrency("$", "CA") === "CAD");
check("currency $ + DE -> unknown", resolveCurrency("$", "DE") === "");
check("currency code wins", resolveCurrency("SEK", "SE") === "SEK");

// --- dates ---
check("date: real", isoToSimpleDate("2026-10-12")?.iso === "2026-10-12");
check("date: 31 Sep is not a date", isoToSimpleDate("2026-09-31") === null);
check("date: DD/MM is refused (must be ISO)", isoToSimpleDate("12/10/2026") === null);

// --- the code checks on a read ---
const good: PayoutRead = {
  kind: "payment-statement", currencyAsPrinted: "€", settlementStart: "2026-09-28", settlementEnd: "2026-10-12",
  sections: [{ name: "Beginning balance", amount: 0 }, { name: "Sales", amount: 54388.87 },
    { name: "Refunds", amount: -5450.05 }, { name: "Expenses", amount: -41966.09 }],
  netProceeds: 6972.73, transferAmount: 6972.73, transferDate: "2026-10-12",
};
check("checks: the hand-read DE statement passes", payoutProblem(good) === null);
check("checks: one cent off in a section fails",
  payoutProblem({ ...good, sections: [...good.sections.slice(0, 3), { name: "Expenses", amount: -41966.08 }] }) !== null);
check("checks: a sub-line added fails (sum no longer = net)",
  payoutProblem({ ...good, sections: [...good.sections, { name: "Product charges", amount: 44539.42 }] }) !== null);
check("checks: transfer differs from net fails", payoutProblem({ ...good, transferAmount: 6972.37 }) !== null);
check("checks: day/month swapped dates fail", payoutProblem({ ...good, settlementEnd: "2026-12-10" }) !== null);
check("checks: transfer long after the period fails", payoutProblem({ ...good, transferDate: "2026-11-20" }) !== null);
check("checks: a fee invoice is not a payout", payoutProblem({ ...good, kind: "fee-invoice" }) !== null);

// --- the name ---
check("name: payout", buildAmazonName({ currency: "EUR", totalCents: 697273, country: "DE", docType: "payment-statement" })
  === "Amazon DE Payout EUR 6,972.73.pdf");
check("name: negative payout keeps its sign",
  buildAmazonName({ currency: "EUR", totalCents: -1234, country: "DE", docType: "payment-statement" })
  === "Amazon DE Payout EUR -12.34.pdf");
check("name: fee credit note unchanged (no sign)",
  buildAmazonName({ currency: "EUR", totalCents: -40538, country: "FR", docType: "fba-credit-note" })
  === "Amazon FR Fulfillment VAT credit EUR 405.38.pdf");

// --- the full path with a stubbed read (no network): same object the route gets ---
const base = { fileName: "Statement View.pdf", invoiceNumber: "", docType: "other", country: "", marketplace: "",
  seller: "", supplier: "", dateISO: "", currency: "", netCents: 0, vatCents: 0, totalCents: 0, proposedName: "",
  drivePath: "", source: "text", needsReview: false } as const;
const stub = (r: PayoutRead | null) => async () => r;
const inv = await classifyAndReadPayout(Buffer.from(""), "Statement View.pdf", "Amazon/DE/Statement View.pdf", { ...base }, stub(good));
check("stub: named", typeof inv === "object" && inv !== null && inv.proposedName === "Amazon DE Payout EUR 6,972.73.pdf");
check("stub: filed in the transfer month", typeof inv === "object" && inv !== null && inv.drivePath === "Accounting/10. Oct 2026/Amazon/DE");
check("stub: flagged for review", typeof inv === "object" && inv !== null && inv.needsReview === true && !inv.error);
const loose = await classifyAndReadPayout(Buffer.from(""), "x.pdf", "x.pdf", { ...base }, stub(good));
check("stub: loose file (no folder) -> unreadable, no name",
  typeof loose === "object" && loose !== null && Boolean(loose.error) && loose.proposedName === "");
const bad = await classifyAndReadPayout(Buffer.from(""), "x.pdf", "Amazon/DE/x.pdf", { ...base }, stub({ ...good, netProceeds: 6972.74, transferAmount: 6972.74 }));
check("stub: sums disagree -> unreadable with the reason",
  typeof bad === "object" && bad !== null && /do not add up/.test(bad.error ?? "") && bad.proposedName === "");
check("stub: fee invoice handed back to the invoice reader",
  (await classifyAndReadPayout(Buffer.from(""), "x.pdf", "x.pdf", { ...base }, stub({ ...good, kind: "fee-invoice" }))) === "fee-invoice");
check("stub: AI unavailable -> null (caller falls back)",
  (await classifyAndReadPayout(Buffer.from(""), "x.pdf", "x.pdf", { ...base }, stub(null))) === null);

// --- the REAL file, through the same entry point the routes use ---
// Load .env the same way verify-ai.mts does (tsx does not auto-load it).
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (process.env.ANTHROPIC_API_KEY) {
  const { parseAmazonInvoice } = await import("../src/lib/amazon/parse");
  const file = "test-data/project-3/payouts/Amazon/DE/Statement View.pdf";
  const real = await parseAmazonInvoice(readFileSync(file), "Statement View.pdf", "Amazon/DE/Statement View.pdf");
  console.log("REAL:", JSON.stringify({ name: real.proposedName, path: real.drivePath, type: real.docType,
    cur: real.currency, cents: real.totalCents, period: [real.periodStartISO, real.periodEndISO], transfer: real.transferDateISO,
    review: real.needsReview, error: real.error }));
  check("REAL: payout statement", real.docType === "payment-statement" && !real.error);
  check("REAL: name = Amazon DE Payout EUR 6,972.73.pdf", real.proposedName === "Amazon DE Payout EUR 6,972.73.pdf");
  check("REAL: folder Accounting/10. Oct 2026/Amazon/DE", real.drivePath === "Accounting/10. Oct 2026/Amazon/DE");
  check("REAL: settlement 2026-09-28 .. 2026-10-12", real.periodStartISO === "2026-09-28" && real.periodEndISO === "2026-10-12");
  check("REAL: transfer 2026-10-12, EUR 6,972.73", real.transferDateISO === "2026-10-12" && real.currency === "EUR" && real.totalCents === 697273);
  check("REAL: flagged for review", real.needsReview === true);
  const realLoose = await parseAmazonInvoice(readFileSync(file), "Statement View.pdf");
  check("REAL: same file uploaded loose -> unreadable (no country), never a guessed name", Boolean(realLoose.error) && realLoose.proposedName === "");
} else {
  console.log("(no ANTHROPIC_API_KEY: real-file part skipped)");
}

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} pass`);
process.exit(failed ? 1 : 0);

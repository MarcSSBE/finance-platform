/**
 * Fortnox SIE file (SIE 4, one voucher) from an Amex statement, Veronica 2026-11-10: "Ideally, the AI would handle
 * the bookkeeping for all licenses (which make up the majority of the transactions), and I could then add the rest
 * manually". Travel (Christoffer: business entertainment vs per diem) and anything new or unclear is NOT booked: it is
 * listed for her, and the voucher only carries the lines we are sure of, so it always balances.
 *
 * The rules are HER OWN choices, read from her Fortnox voucher A 1118 (booked 2026-08-31 = Amex statement
 * 2026-08-03..2026-09-02, every line matched, total 190,958.53 SEK):
 *  - Google Ads -> 4524; other services bought abroad -> 4531; DC membership -> 6551, each with reverse-charge VAT
 *    25 %: 2645 debit and 2614 credit, VAT = 25 % of the SEK amount, rounded half up to the öre;
 *  - Kivra -> 5420 with Swedish VAT 25 % on 2641 (the amount includes the VAT);
 *  - the Amex annual fee -> 6570, no VAT;
 *  - the card total is credited to 1681 (American Express Elite). Payments to Amex are not part of this voucher.
 * The SEK amount on the statement already includes Amex's currency fee; she books that full amount.
 * All amounts are integer öre, computed in code. No AI here.
 */
import type { AmexLine, AmexStatement } from "./types";

export type VatRule = "rc25" | "se25" | "none";

interface Rule {
  match: RegExp;
  account: string;
  vat: VatRule;
  /** Merchant name as it shows in her voucher A 1118 (for the reason text). */
  seen: string;
}

/** Order matters: the first rule that matches wins (Google Ads before other Google charges). */
export const RULES: Rule[] = [
  { match: /google\s*\*\s*ads|google\*ads/i, account: "4524", vat: "rc25", seen: "Google Ads" },
  { match: /\bgoogle\b/i, account: "4531", vat: "rc25", seen: "Google (Dublin)" },
  { match: /\bkivra\b/i, account: "5420", vat: "se25", seen: "Kivra" },
  { match: /\bdc membership\b/i, account: "6551", vat: "rc25", seen: "DC Membership (Dynamite Ventures)" },
  ...[
    "helium 10", "tracefuse", "apify", "heroku", "channelrep", "www.channe", "ahrefs", "flippa", "zendesk", "slack",
    "openai", "webbee", "pickfu", "lovable", "tello", "shopify", "twilio", "intellivy", "midjourney", "manychat",
    "leonardo.ai", "adobe", "canva", "wispr",
  ].map((name) => ({
    match: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
    account: "4531",
    vat: "rc25" as VatRule,
    seen: name,
  })),
];

/** Travel and entertainment: Veronica decides each one (entertainment, per diem, or charged on to SS LLC). */
const TRAVEL = /hotel|airbnb|booking\.com|awardfares|\bsas\b|norwegian|airline|airways|flyg|\buber\b|taxi|restaurant|resto|\bbar\b|cafe|parking|train|\bsj\b/i;
/** What she did last time, shown as a hint only (A 1118). */
const TRAVEL_HINTS: [RegExp, string][] = [
  [/awardfares/i, "last time: 5810 Biljetter"],
  [/hotel/i, "last time: 1667 Fordringar SS LLC (Hotel Nittra)"],
];

export interface SieDecision {
  line: AmexLine;
  status: "booked" | "for-you" | "not-in-voucher";
  account?: string;
  vat?: VatRule;
  reason: string;
}

export function decide(line: AmexLine): SieDecision {
  if (line.kind === "payment") return { line, status: "not-in-voucher", reason: "Payment to Amex (booked from the bank)." };
  if (line.kind === "card-fee") return { line, status: "booked", account: "6570", vat: "none", reason: "Amex annual fee (as in A 1118)." };
  if (line.kind === "credit" || line.sekCents <= 0)
    return { line, status: "for-you", reason: "Refund or credit: book it against the original purchase." };
  if (line.kind !== "purchase") return { line, status: "for-you", reason: "Not an Amex card purchase." };
  if (TRAVEL.test(line.description)) {
    const hint = TRAVEL_HINTS.find(([re]) => re.test(line.description))?.[1];
    return { line, status: "for-you", reason: `Travel: entertainment, per diem or charged on${hint ? ` (${hint})` : ""}.` };
  }
  const rule = RULES.find((r) => r.match.test(line.description));
  if (!rule) return { line, status: "for-you", reason: "New merchant: not in your earlier Amex voucher." };
  // Swedish VAT (Kivra) only for a SEK charge. Reverse charge does NOT depend on the currency: in A 1118 she booked
  // Adobe, Wispr, Canva and Google Dublin, all charged in SEK, on 4531 with reverse charge (foreign companies).
  if (rule.vat === "se25" && line.originalCurrency !== "SEK")
    return { line, status: "for-you", reason: `${rule.seen} charged in ${line.originalCurrency}: check the VAT.` };
  return { line, status: "booked", account: rule.account, vat: rule.vat, reason: `As in A 1118 (${rule.seen}).` };
}

/** 25 % of an amount in öre, rounded half up (A 1118: 1 915,18 -> 478,80). */
export const quarter = (ore: number) => Math.floor((ore * 25 + 50) / 100);

export interface SieTrans {
  account: string;
  ore: number; // debit positive, credit negative
  text: string;
}

export interface SieVoucher {
  series: string;
  dateISO: string;
  text: string;
  trans: SieTrans[];
  decisions: SieDecision[];
  bookedOre: number; // sum of the booked statement amounts = the 1681 credit
  forYouOre: number;
}

export function buildVoucher(st: AmexStatement, opts: { series?: string; dateISO: string; text?: string }): SieVoucher {
  const decisions = st.lines.map(decide);
  const trans: SieTrans[] = [];
  let booked = 0;
  for (const d of decisions) {
    if (d.status !== "booked") continue;
    const amt = d.line.sekCents;
    const text = d.line.description.slice(0, 60);
    booked += amt;
    if (d.vat === "se25") {
      const base = Math.round(amt / 1.25); // the statement amount includes Swedish VAT
      trans.push({ account: d.account!, ore: base, text }, { account: "2641", ore: amt - base, text });
    } else {
      trans.push({ account: d.account!, ore: amt, text });
      if (d.vat === "rc25") {
        const vat = quarter(amt);
        trans.push({ account: "2645", ore: vat, text }, { account: "2614", ore: -vat, text });
      }
    }
  }
  if (booked) trans.push({ account: "1681", ore: -booked, text: "American Express" });
  const forYou = decisions.filter((d) => d.status === "for-you").reduce((n, d) => n + d.line.sekCents, 0);
  return {
    series: opts.series ?? "A",
    dateISO: opts.dateISO,
    text: opts.text ?? `Amex ${st.periodStartISO} - ${st.periodEndISO}`,
    trans,
    decisions,
    bookedOre: booked,
    forYouOre: forYou,
  };
}

/** Last day of the month before the statement date (A 1118: statement 2026-09-02 -> booked 2026-08-31). */
export function defaultVoucherDate(statementDateISO: string): string {
  const [y, m] = statementDateISO.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 0));
  return d.toISOString().slice(0, 10);
}

const money = (ore: number) => `${ore < 0 ? "-" : ""}${Math.floor(Math.abs(ore) / 100)}.${String(Math.abs(ore) % 100).padStart(2, "0")}`;
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** SIE 4 text (one #VER). Empty voucher number: Fortnox gives the next number in the series. */
export function sieText(v: SieVoucher, company: { orgNr: string; name: string }, genDateISO: string): string {
  const ymd = (iso: string) => iso.replace(/-/g, "");
  const lines = [
    "#FLAGGA 0",
    `#PROGRAM ${quote("BE Finance Platform")} 1.0`,
    "#FORMAT PC8",
    `#GEN ${ymd(genDateISO)}`,
    "#SIETYP 4",
    `#ORGNR ${company.orgNr}`,
    `#FNAMN ${quote(company.name)}`,
    `#VER ${v.series} "" ${ymd(v.dateISO)} ${quote(v.text)}`,
    "{",
    ...v.trans.map((t) => `   #TRANS ${t.account} {} ${money(t.ore)} "" ${quote(t.text)}`),
    "}",
  ];
  return lines.join("\r\n") + "\r\n";
}

// "#FORMAT PC8" = IBM code page 437 (the SIE standard). Swedish letters and the common Latin ones; others -> "?".
const CP437: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, å: 0x86, ç: 0x87, ê: 0x88, ë: 0x89, è: 0x8a, ï: 0x8b,
  î: 0x8c, ì: 0x8d, Ä: 0x8e, Å: 0x8f, É: 0x90, æ: 0x91, Æ: 0x92, ô: 0x93, ö: 0x94, ò: 0x95, û: 0x96, ù: 0x97,
  ÿ: 0x98, Ö: 0x99, Ü: 0x9a, á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5,
};
export function toCp437(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else out.push(CP437[ch] ?? 0x3f);
  }
  return Uint8Array.from(out);
}

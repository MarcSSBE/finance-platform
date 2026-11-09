/**
 * WorldFirst totals by type (Veronica, 2026-11-09).
 *
 * She never needs the statement's grand total: she reconciles specific types
 * against each platform's own statement (Google Ads, TikTok Ads, Facebook ads,
 * TikTok Shop payouts, ...). This groups every row of a WorldFirst statement
 * (the .xlsx export or the PDF, read by `src/lib/amex/worldfirst.ts`) by type
 * and totals money out and money in per currency.
 *
 * All deterministic, integer cents, no AI. Refunds the PDF prints without a
 * merchant (only the card reference) are paired with the charge they reverse
 * on the EXACT amount + currency (closest earlier charge, one to one). That is
 * strong evidence, not proof (the statement does not say what the row is), so
 * the page shows them as money back next to the charges, never folded silently;
 * a refund with no such charge stays in its own group, never guessed into one.
 */
import type { AmexLine, AmexStatement } from "@/lib/amex/types";

export type TypeCategory =
  | "google-ads"
  | "tiktok-ads"
  | "facebook-ads"
  | "tiktok-shop"
  | "payout"
  | "card"
  | "transfer"
  | "withdrawal"
  | "conversion"
  | "other-in"
  | "refund-unmatched";

/** The types she named, always listed first (also when a month has none). */
export const FEATURED: { category: TypeCategory; label: string }[] = [
  { category: "google-ads", label: "Google Ads" },
  { category: "tiktok-ads", label: "TikTok Ads" },
  { category: "facebook-ads", label: "Facebook ads" },
  { category: "tiktok-shop", label: "TikTok Shop payouts" },
];

export interface TypeLine {
  dateISO: string;
  description: string;
  currency: string;
  /** Money out is positive, money in negative (as on the statement lines). */
  cents: number;
  /** For a refund printed without a merchant: the charge it was paired with. */
  refundOf?: { dateISO: string; description: string };
}

export interface CurrencyTotals {
  currency: string;
  outCents: number;
  inCents: number;
  /** out - in */
  netCents: number;
  count: number;
}

export interface TypeGroup {
  key: string;
  label: string;
  category: TypeCategory;
  featured: boolean;
  totals: CurrencyTotals[];
  lines: TypeLine[];
}

export interface TypeBreakdown {
  periodStartISO: string;
  periodEndISO: string;
  rowCount: number;
  /** Every row agrees with the printed running balance / summary (see parseWorldFirstPdf). */
  checked: boolean;
  groups: TypeGroup[];
}

const clean = (s: string) =>
  s
    .replace(/\(\d*\*+\d*\)/g, "") // card number fragments "(52737559****9556)"
    .replace(/\(\d*$/, "") // a card number cut off at the end of the line
    .replace(/\s+/g, " ")
    .trim();

/** Card merchant label: the description without reference numbers, invoice ids, card fragments. */
function merchant(description: string): string {
  return clean(description)
    .split(" ")
    // Reference numbers and invoice ids ("AUG-113665762", "INV#2026...", "1JVW4IBS-0006"), not names with
    // a digit or two ("21ST.DEV").
    .filter((w) => (w.match(/\d/g) ?? []).length < 4 && !w.includes("#"))
    .join(" ")
    .replace(/\s*\*\s*$/, "")
    .trim();
}

/** Pure: the type of one statement row (its group key, label and category). */
export function typeOf(description: string, cents: number): { key: string; label: string; category: TypeCategory } {
  const d = clean(description);
  if (/GOOGLE\s*\*\s*ADS/i.test(d)) return { key: "google-ads", label: "Google Ads", category: "google-ads" };
  if (/^Collection-.*TIK\s*TOK/i.test(d)) return { key: "tiktok-shop", label: "TikTok Shop payouts", category: "tiktok-shop" };
  if (/TIK\s*TOK\s*ADS/i.test(d)) return { key: "tiktok-ads", label: "TikTok Ads", category: "tiktok-ads" };
  if (/^FACEBK\b/i.test(d)) return { key: "facebook-ads", label: "Facebook ads", category: "facebook-ads" };
  if (/^Collection-.*AMAZON/i.test(d)) return { key: "payout:amazon", label: "Amazon payouts", category: "payout" };
  if (/^Collection-.*SHOPIFY/i.test(d)) return { key: "payout:shopify", label: "Shopify payouts", category: "payout" };
  const named = (prefix: string, category: TypeCategory, label: string) => {
    const rest = d.replace(new RegExp(`^${prefix}-\\s*`, "i"), "").replace(/\(.*$/, "").trim();
    return { key: `${category}:${rest.toLowerCase()}`, label: rest ? `${label}: ${rest}` : label, category };
  };
  if (/^Collection-/i.test(d)) return named("Collection", "other-in", "Collection");
  if (/^Transfer-/i.test(d)) return named("Transfer", "transfer", "Transfer");
  if (/^Withdrawal-/i.test(d)) return named("Withdrawal", "withdrawal", "Withdrawal");
  if (/^Conversion-/i.test(d)) return named("Conversion", "conversion", "Conversion");
  if (/^Cash Reward/i.test(d)) return { key: "other-in:cash-reward", label: "Cash reward", category: "other-in" };
  if (!d && cents < 0)
    return { key: "refund-unmatched", label: "Refunds (merchant not printed)", category: "refund-unmatched" };
  const m = merchant(d) || d || "(no description)";
  return { key: `card:${m.toLowerCase()}`, label: m, category: "card" };
}

const DAY_MS = 86_400_000;
const REFUND_WINDOW_DAYS = 60;
const isoMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Pure: pair refunds printed without a merchant with the charge they reverse.
 * Same currency, exact amount, charge on or before the refund's posting date
 * and at most 60 days earlier, closest first, each charge used once.
 * Returns refund line index -> charge line index.
 */
export function pairBlankRefunds(lines: AmexLine[]): Map<number, number> {
  const used = new Set<number>();
  const pairs = new Map<number, number>();
  lines.forEach((r, i) => {
    if (r.description || r.originalCents >= 0) return;
    let best = -1;
    let bestGap = Infinity;
    lines.forEach((c, j) => {
      if (used.has(j) || !c.description || c.originalCents !== -r.originalCents) return;
      if (c.originalCurrency !== r.originalCurrency) return;
      const gap = (isoMs(r.processDateISO) - isoMs(c.processDateISO)) / DAY_MS;
      if (gap < 0 || gap > REFUND_WINDOW_DAYS) return;
      if (gap < bestGap) {
        best = j;
        bestGap = gap;
      }
    });
    if (best >= 0) {
      used.add(best);
      pairs.set(i, best);
    }
  });
  return pairs;
}

/** Pure: the statement grouped by type, featured types first, then by category and money out. */
export function breakdownByType(statement: AmexStatement): TypeBreakdown {
  const lines = statement.lines;
  const pairs = pairBlankRefunds(lines);
  const groups = new Map<string, TypeGroup>();
  const group = (t: { key: string; label: string; category: TypeCategory }) => {
    let g = groups.get(t.key);
    if (!g) {
      g = { ...t, featured: FEATURED.some((f) => f.category === t.category), totals: [], lines: [] };
      groups.set(t.key, g);
    }
    return g;
  };
  for (const f of FEATURED) group({ key: f.category, label: f.label, category: f.category });

  lines.forEach((l, i) => {
    const charge = pairs.has(i) ? lines[pairs.get(i)!] : null;
    const t = typeOf(charge ? charge.description : l.description, l.originalCents);
    const g = group(t);
    g.lines.push({
      dateISO: l.processDateISO,
      description: l.description,
      currency: l.originalCurrency,
      cents: l.originalCents,
      ...(charge ? { refundOf: { dateISO: charge.processDateISO, description: charge.description } } : {}),
    });
    let tot = g.totals.find((x) => x.currency === l.originalCurrency);
    if (!tot) {
      tot = { currency: l.originalCurrency, outCents: 0, inCents: 0, netCents: 0, count: 0 };
      g.totals.push(tot);
    }
    if (l.originalCents > 0) tot.outCents += l.originalCents;
    else tot.inCents += -l.originalCents;
    tot.netCents = tot.outCents - tot.inCents;
    tot.count++;
  });

  const order: TypeCategory[] = [
    ...FEATURED.map((f) => f.category),
    "card",
    "payout",
    "other-in",
    "refund-unmatched",
    "transfer",
    "withdrawal",
    "conversion",
  ];
  const outSum = (g: TypeGroup) => g.totals.reduce((s, t) => s + t.outCents + t.inCents, 0);
  const sorted = [...groups.values()].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || outSum(b) - outSum(a) || a.label.localeCompare(b.label),
  );
  for (const g of sorted) g.totals.sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    periodStartISO: statement.periodStartISO,
    periodEndISO: statement.periodEndISO,
    rowCount: lines.length,
    checked: statement.totalsMatch,
    groups: sorted,
  };
}

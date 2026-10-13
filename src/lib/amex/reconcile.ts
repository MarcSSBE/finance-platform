import type { AmexMatch, AmexReceipt, AmexReconciliation, AmexStatement } from "./types";

const DEFAULT_TOLERANCE_DAYS = 3;
const DAY_MS = 86_400_000;

/**
 * Match statement charges to receipts. Deliberately conservative, because a
 * wrong pairing hides a missing receipt:
 *
 *   - amount: the receipt amount must EQUAL the charge's original-currency
 *     amount (the figure on the merchant's receipt, e.g. USD 197.00), never the
 *     SEK amount, which includes Amex's currency fee;
 *   - vendor: the receipt's vendor must match the statement text (small typos
 *     like "Twillio" for "Twilio" are tolerated);
 *   - date: a receipt with a day must be within ±tolerance days of the charge;
 *     one with only a month ("aug-26") must fall in that purchase month.
 *
 * Each receipt and each charge is used at most once. Candidate pairs are taken
 * best-first (same currency, then closest date), so a receipt naming the exact
 * day wins its own charge before a month-only receipt takes any remaining one.
 * Amount + date fits with a different vendor are only surfaced as hints.
 */
export function reconcileAmex(
  statement: AmexStatement,
  receipts: AmexReceipt[],
  unreadableNames: string[] = [],
  toleranceDays = DEFAULT_TOLERANCE_DAYS,
): AmexReconciliation {
  const lines = statement.lines;
  const wanted = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.needsReceipt);

  const periodStart = toMs(statement.periodStartISO);
  const periodEnd = toMs(statement.periodEndISO);
  const outsidePeriod: AmexReceipt[] = [];
  const inScope: AmexReceipt[] = [];
  for (const r of receipts) {
    const [from, to] = receiptWindow(r);
    if (Number.isFinite(periodStart) && Number.isFinite(periodEnd) && (to < periodStart || from > periodEnd)) {
      outsidePeriod.push(r);
    } else {
      inScope.push(r);
    }
  }

  interface Candidate {
    lineIndex: number;
    receiptIndex: number;
    dayDiff: number | null;
    currencyDiffers: boolean;
  }
  const candidates: Candidate[] = [];
  const hintMap = new Map<number, Set<number>>();

  inScope.forEach((r, ri) => {
    for (const { l, i } of wanted) {
      if (l.originalCents !== r.cents) continue;
      const dayDiff = dateFit(r, l.dateISO, toleranceDays);
      if (dayDiff === false) continue;
      if (!vendorMatches(r.vendor, l.description)) {
        if (!hintMap.has(i)) hintMap.set(i, new Set());
        hintMap.get(i)!.add(ri);
        continue;
      }
      candidates.push({
        lineIndex: i,
        receiptIndex: ri,
        dayDiff,
        currencyDiffers: r.currency !== null && r.currency !== l.originalCurrency,
      });
    }
  });

  candidates.sort(
    (a, b) =>
      Number(a.currencyDiffers) - Number(b.currencyDiffers) ||
      (a.dayDiff ?? toleranceDays + 1) - (b.dayDiff ?? toleranceDays + 1) ||
      lines[a.lineIndex].dateISO.localeCompare(lines[b.lineIndex].dateISO) ||
      a.receiptIndex - b.receiptIndex,
  );

  const usedLine = new Set<number>();
  const usedReceipt = new Set<number>();
  const matched: AmexMatch[] = [];
  for (const c of candidates) {
    if (usedLine.has(c.lineIndex) || usedReceipt.has(c.receiptIndex)) continue;
    usedLine.add(c.lineIndex);
    usedReceipt.add(c.receiptIndex);
    matched.push({
      lineIndex: c.lineIndex,
      receipt: inScope[c.receiptIndex],
      dayDiff: c.dayDiff,
      notes: c.currencyDiffers ? ["currency-differs"] : [],
    });
  }
  matched.sort((a, b) => lines[a.lineIndex].dateISO.localeCompare(lines[b.lineIndex].dateISO) || a.lineIndex - b.lineIndex);

  const missing = wanted.map(({ i }) => i).filter((i) => !usedLine.has(i));
  const hints = missing
    .filter((i) => hintMap.has(i))
    .map((i) => ({
      lineIndex: i,
      fileNames: [...hintMap.get(i)!].filter((ri) => !usedReceipt.has(ri)).map((ri) => inScope[ri].fileName),
    }))
    .filter((h) => h.fileNames.length > 0);

  return {
    toleranceDays,
    matched,
    missing,
    unmatchedReceipts: inScope.filter((_, ri) => !usedReceipt.has(ri)),
    outsidePeriod,
    unreadableNames,
    hints,
  };
}

function toMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return y ? Date.UTC(y, m - 1, d) : NaN;
}

/** The span of dates a receipt name can mean: one day, or its whole month. */
function receiptWindow(r: AmexReceipt): [number, number] {
  if (r.day !== null) {
    const t = Date.UTC(r.year, r.month, r.day);
    return [t, t];
  }
  return [Date.UTC(r.year, r.month, 1), Date.UTC(r.year, r.month + 1, 0)];
}

/**
 * Does the charge date fit the receipt? Returns the day difference for a dated
 * receipt, null for a month-only receipt in the right month, false otherwise.
 */
function dateFit(r: AmexReceipt, chargeISO: string, toleranceDays: number): number | null | false {
  const charge = toMs(chargeISO);
  if (r.day !== null) {
    const diff = Math.round(Math.abs(charge - Date.UTC(r.year, r.month, r.day)) / DAY_MS);
    return diff <= toleranceDays ? diff : false;
  }
  const d = new Date(charge);
  return d.getUTCFullYear() === r.year && d.getUTCMonth() === r.month ? null : false;
}

// ── vendor matching ─────────────────────────────────────────────────────────

/** Words that say nothing about who the vendor is. */
const GENERIC = new Set([
  "ai", "inc", "com", "ltd", "llc", "ab", "bv", "gmbh", "the", "io", "co", "www",
  "limited", "subscription", "subscr", "invoice", "receipt", "kvitto",
]);

/** Her name for a vendor → how the statement prints it. */
const ALIASES: Record<string, string[]> = {
  facebook: ["facebk"],
  meta: ["facebk"],
  chatgpt: ["openai"],
};

function tokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function tokenMatches(want: string, have: string): boolean {
  if (want === have) return true;
  // "zendesk" ↔ "zendeskcom", "channel" ↔ "channelrep", "hotels" ↔ "hotelcom"
  if (want.length >= 4 && have.length >= 4 && (have.startsWith(want) || want.startsWith(have))) return true;
  // Typos: "twillio" ↔ "twilio".
  return want.length >= 5 && have.length >= 5 && levenshtein(want, have) <= 1;
}

/** Does the vendor she typed refer to the merchant printed on the statement? */
export function vendorMatches(receiptVendor: string, description: string): boolean {
  const all = tokens(receiptVendor).filter((t) => !/^\d+$/.test(t));
  const significant = all.filter((t) => t.length >= 3 && !GENERIC.has(t));
  const want = significant.length > 0 ? significant : all;
  if (want.length === 0) return false;
  const have = tokens(description);
  const squashed = have.join("");
  return want.some(
    (w) =>
      have.some((h) => tokenMatches(w, h)) ||
      (ALIASES[w] ?? []).some((a) => have.includes(a)) ||
      (w.length >= 5 && squashed.includes(w)),
  );
}

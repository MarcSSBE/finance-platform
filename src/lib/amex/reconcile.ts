import type { AmexLine, AmexMatch, AmexReceipt, AmexReconciliation, AmexStatement } from "./types";

const DEFAULT_TOLERANCE_DAYS = 3;
const DAY_MS = 86_400_000;
/** A monthly bill's final charge can land on the 1st-3rd of the next month. */
const SPILL_DAYS = 3;
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

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
 *     one with only a month ("aug-26") must fall in that purchase month, or be
 *     a bill for that month charged the month after when the statement text
 *     itself names the month ("Heroku* Jun-112685214" charged Jul 6).
 *
 * Each receipt and each charge is used at most once. Candidate pairs are taken
 * best-first (same currency, then same month, then closest date), so a receipt
 * naming the exact day wins its own charge before a month-only receipt takes
 * any remaining one.
 *
 * Then, a month-only receipt still unused may cover SEVERAL charges (Google
 * Ads bills its monthly spend as many auto-charges but issues one receipt):
 * it is paired only when the same vendor's remaining charges for that month
 * (plus any on the 1st-3rd of the next) add up to its amount to the cent.
 *
 * Amount + date fits with a different vendor, and vendor + date fits with a
 * different amount, are only surfaced as hints.
 */
export function reconcileAmex(
  statement: AmexStatement,
  receipts: AmexReceipt[],
  unreadableNames: string[] = [],
  toleranceDays = DEFAULT_TOLERANCE_DAYS,
): AmexReconciliation {
  const lines = statement.lines;
  const wanted = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.needsReceipt && l.originalCents > 0);
  // A WorldFirst bank transfer needs no receipt, but she often files the
  // supplier's invoice for it ("Ships a lot Invoice_14931 $3013,68"): such a
  // receipt may pair with the transfer, so it does not show as "no charge".
  // A transfer without one is never listed as missing.
  const matchable = [
    ...wanted,
    ...lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.kind === "transfer" && l.originalCents > 0 && !/^conversion-/i.test(l.description)),
  ];

  interface Candidate {
    lineIndex: number;
    receiptIndex: number;
    dayDiff: number | null;
    currencyDiffers: boolean;
    billedLater: boolean;
  }
  const candidates: Candidate[] = [];
  const hintMap = new Map<number, Set<number>>();
  const amountHintMap = new Map<number, Set<number>>();
  const note = (map: Map<number, Set<number>>, i: number, ri: number) => {
    if (!map.has(i)) map.set(i, new Set());
    map.get(i)!.add(ri);
  };

  receipts.forEach((r, ri) => {
    for (const { l, i } of matchable) {
      const fit = dateFit(r, l, toleranceDays);
      if (fit === false) continue;
      const sameVendor = vendorMatches(r.vendor, l.description);
      if (l.originalCents !== r.cents) {
        if (
          sameVendor &&
          !fit.billedLater &&
          !namesOtherMonth(l.description, r.month) &&
          (r.currency === null || r.currency === l.originalCurrency)
        ) {
          note(amountHintMap, i, ri);
        }
        continue;
      }
      if (!sameVendor) {
        if (!fit.billedLater) note(hintMap, i, ri);
        continue;
      }
      candidates.push({
        lineIndex: i,
        receiptIndex: ri,
        dayDiff: fit.dayDiff,
        currencyDiffers: r.currency !== null && r.currency !== l.originalCurrency,
        billedLater: fit.billedLater,
      });
    }
  });

  candidates.sort(
    (a, b) =>
      Number(a.currencyDiffers) - Number(b.currencyDiffers) ||
      Number(a.billedLater) - Number(b.billedLater) ||
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
    const notes: AmexMatch["notes"] = [];
    if (c.currencyDiffers) notes.push("currency-differs");
    if (c.billedLater) notes.push("billed-later");
    matched.push({ lineIndex: c.lineIndex, receipt: receipts[c.receiptIndex], dayDiff: c.dayDiff, notes });
  }

  // One receipt, several charges (exact sum only).
  receipts.forEach((r, ri) => {
    if (usedReceipt.has(ri) || r.day !== null) return;
    const pool = wanted.filter(
      ({ l, i }) =>
        !usedLine.has(i) &&
        (r.currency === null || r.currency === l.originalCurrency) &&
        vendorMatches(r.vendor, l.description),
    );
    // One card's receipt: with several statements, each card's charges are
    // summed on their own, never Amex and WorldFirst together.
    for (const part of new Set(pool.map(({ l }) => l.part ?? 0))) {
      const own = pool.filter(({ l }) => (l.part ?? 0) === part);
      const inMonth = own.filter(({ l }) => monthOffset(l.dateISO, r) === 0);
      const spill = own.filter(({ l }) => monthOffset(l.dateISO, r) === 1 && dayOf(l.dateISO) <= SPILL_DAYS);
      // The 1st-3rd of its own month may hold the PREVIOUS month's final charge.
      const ownEarly = inMonth.filter(({ l }) => dayOf(l.dateISO) <= SPILL_DAYS);
      const options = [inMonth, [...inMonth, ...spill], [...inMonth.filter((x) => !ownEarly.includes(x)), ...spill]];
      const set = options.find(
        (set) =>
          set.length >= 2 &&
          new Set(set.map(({ l }) => l.originalCurrency)).size === 1 &&
          set.reduce((a, { l }) => a + l.originalCents, 0) === r.cents,
      );
      if (!set) continue;
      usedReceipt.add(ri);
      for (const { i } of set) {
        usedLine.add(i);
        matched.push({ lineIndex: i, receipt: r, dayDiff: null, notes: ["combined"], covers: set.length });
      }
      break;
    }
  });

  matched.sort((a, b) => lines[a.lineIndex].dateISO.localeCompare(lines[b.lineIndex].dateISO) || a.lineIndex - b.lineIndex);

  // Unused receipts that belong to another statement are set aside; the rest
  // fit no charge on this one. A statement runs 3rd to 2nd, so a month-only
  // receipt counts as this statement's only when most of its month is inside
  // the period (an "aug-26" receipt is not this one's just because Aug 1-2 are).
  // With several statements, it must be outside every one of their periods.
  const periods = (statement.periods ?? [[statement.periodStartISO, statement.periodEndISO]])
    .map(([a, b]) => [toMs(a), toMs(b)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const outsidePeriod: AmexReceipt[] = [];
  const unmatchedReceipts: AmexReceipt[] = [];
  receipts.forEach((r, ri) => {
    if (usedReceipt.has(ri)) return;
    const [from, to] = receiptWindow(r);
    const windowDays = (to - from) / DAY_MS + 1;
    const outside =
      periods.length > 0 &&
      periods.every(([start, end]) => ((Math.min(to, end) - Math.max(from, start)) / DAY_MS + 1) * 2 < windowDays);
    (outside ? outsidePeriod : unmatchedReceipts).push(r);
  });

  const missing = wanted.map(({ i }) => i).filter((i) => !usedLine.has(i));
  const unmatchedSet = new Set(unmatchedReceipts);
  const openTransfers = matchable.map(({ i }) => i).filter((i) => !usedLine.has(i) && !lines[i].needsReceipt);
  const hintsFrom = (map: Map<number, Set<number>>, among = missing) =>
    among
      .filter((i) => map.has(i))
      .map((i) => ({
        lineIndex: i,
        fileNames: [...map.get(i)!].filter((ri) => unmatchedSet.has(receipts[ri])).map((ri) => receipts[ri].fileName),
      }))
      .filter((h) => h.fileNames.length > 0);

  return {
    toleranceDays,
    matched,
    missing,
    unmatchedReceipts,
    outsidePeriod,
    unreadableNames,
    hints: hintsFrom(hintMap),
    amountHints: hintsFrom(amountHintMap),
    transferHints: hintsFrom(hintMap, openTransfers),
  };
}

function toMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return y ? Date.UTC(y, m - 1, d) : NaN;
}

function dayOf(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Months from the receipt's month to the charge's (0 = same month, 1 = the next). */
function monthOffset(chargeISO: string, r: AmexReceipt): number {
  const [y, m] = chargeISO.split("-").map(Number);
  return (y - r.year) * 12 + (m - 1 - r.month);
}

/** "Heroku* May-112220703": the statement text names a month other than this one. */
function namesOtherMonth(description: string, month: number): boolean {
  return tokens(description).some((t) => MONTH_ABBR.includes(t) && t !== MONTH_ABBR[month]);
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
 * Does the charge date fit the receipt? A dated receipt must be within the
 * tolerance (dayDiff = days apart). A month-only receipt fits a charge in that
 * month, or (billedLater) one in the next month whose statement text names the
 * receipt's month, as monthly bills charged in arrears do ("Heroku* Jun-...").
 */
function dateFit(
  r: AmexReceipt,
  l: AmexLine,
  toleranceDays: number,
): { dayDiff: number | null; billedLater: boolean } | false {
  if (r.day !== null) {
    const diff = Math.round(Math.abs(toMs(l.dateISO) - Date.UTC(r.year, r.month, r.day)) / DAY_MS);
    return diff <= toleranceDays ? { dayDiff: diff, billedLater: false } : false;
  }
  const offset = monthOffset(l.dateISO, r);
  if (offset === 0) return { dayDiff: null, billedLater: false };
  if (offset === 1 && tokens(l.description).includes(MONTH_ABBR[r.month])) return { dayDiff: null, billedLater: true };
  return false;
}

// ── vendor matching ─────────────────────────────────────────────────────────

/** Words that say nothing about who the vendor is. */
const GENERIC = new Set([
  "ai", "inc", "com", "ltd", "llc", "ab", "bv", "gmbh", "the", "io", "co", "www",
  "limited", "subscription", "subscr", "invoice", "receipt", "kvitto", "labs",
]);

/** Her name for a vendor → how the statement prints it. */
const ALIASES: Record<string, string[]> = {
  facebook: ["facebk"],
  meta: ["facebk"],
  chatgpt: ["openai"],
  sas: ["flysas"],
  // Confirmed by Veronica 2026-10-22 from the receipts themselves.
  kalowave: ["kalodata"], // Kalowave Technology sells the Kalodata membership
  jungle: ["js"], // Jungle Scout's API plan is charged as "JS API SUBSCRIPTION"
  hector: ["neondigital"], // Hector AI is charged as "RAZ*httpwwwneondigital"
  antrophics: ["anthropic"], // her spelling of Anthropic
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
      // "RAZ*httpwwwneondigital": a long alias may sit inside a run-together word.
      (ALIASES[w] ?? []).some((a) => have.includes(a) || (a.length >= 5 && squashed.includes(a))) ||
      (w.length >= 5 && squashed.includes(w)),
  );
}

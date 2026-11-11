/**
 * Facebook ads: WorldFirst card charges vs Meta's billing report (Veronica,
 * 2026-11-10: "Regarding Facebook I got this billing report from Exelle").
 *
 * Meta's "Billing report" PDF lists one row per ads payment: date, transaction
 * ID, "Meta ads payment", payment method ("Mastercard ···· 9556", "American
 * Express ···· 2008", "N/A"), amount in the ad account currency ("SEK2,094.00")
 * and status, then "Total amount billed". A later section lists other payment
 * methods (e.g. "Payment Method: Ad credit") with their own total.
 *
 * How the two sides meet (proven on her October files): WorldFirst charges the
 * card in SEK ("Transaction amount") and books it in EUR; for most charges Meta
 * then gives part of it back (a WorldFirst "Card refund" in EUR, linked to the
 * charge by reference). Meta's row is the amount KEPT, in SEK, dated 0 to 2 days
 * after the charge (once 1 day before). WorldFirst shows the refund only in
 * EUR, so the SEK kept after a partial refund is worked out from the EUR
 * figures: SEK charged × (EUR kept / EUR charged). That is exact up to the
 * rounding of the two EUR amounts, i.e. at most one euro cent in SEK.
 *
 * Every amount is read and compared by code; nothing is guessed. Meta's rows
 * must add up to the totals Meta prints, or the report is flagged.
 */
import { extractPdfItems, type PdfTextItem } from "@/lib/pdf";
import type { AmexStatement } from "@/lib/amex/types";
import { linkRefundsByReference, typeOf } from "./by-type";

export interface MetaBillingLine {
  dateISO: string;
  transactionId: string;
  /** "Meta ads payment", "Meta ads refund" ("" in sections without the column). */
  description: string;
  /** "Mastercard ···· 9556", "American Express ···· 2008", "N/A", or the section's ("Ad credit"). */
  method: string;
  /** Last 4 card digits from the method, null when it shows none. */
  cardLast4: string | null;
  /** Negative for a refund ("-SEK0.01"). */
  cents: number;
  currency: string;
  status: string;
}

export interface MetaBillingSection {
  /** null = the main list (method per row); otherwise "Ad credit" etc. */
  method: string | null;
  printedCents: number | null;
  parsedCents: number;
  count: number;
}

export interface MetaBillingReport {
  account: string;
  periodStartISO: string;
  periodEndISO: string;
  currency: string;
  lines: MetaBillingLine[];
  sections: MetaBillingSection[];
  /** Every section's rows add up to the total Meta prints for it. */
  totalsMatch: boolean;
}

/** Is this PDF text Meta's billing report? */
export function isMetaBillingText(text: string): boolean {
  return /Meta Platforms Ireland/i.test(text) && /Billing report:\s*\d{2}\/\d{2}\/\d{4}/i.test(text);
}

const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const AMOUNT = /^(-?)([A-Z]{3})(-?)([\d,]+)\.(\d{2})$/;
const ddmmyyyy = (s: string) => {
  const m = s.match(DATE);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** "SEK2,094.00" / "-SEK0.01" → [cents, "SEK"]. */
export function metaAmount(s: string): [number, string] | null {
  const m = s.match(AMOUNT);
  if (!m) return null;
  const cents = parseInt(m[4].replace(/,/g, ""), 10) * 100 + parseInt(m[5], 10);
  return [m[1] || m[3] ? -cents : cents, m[2]];
}

/**
 * Pure: the report from its text items. Rows are rebuilt by position: a row
 * starts at a date in the left column; the transaction ID and the payment
 * method wrap onto a second line a few points above and below it. Every row
 * must have exactly one amount and one status, or the report is rejected.
 */
export function parseMetaBillingItems(items: PdfTextItem[]): MetaBillingReport {
  const all = items.map((i) => i.str).join("\n");
  const period = all.match(/Billing report:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!period) throw new Error("This is not a Meta billing report (no billing period found).");
  const account = all.match(/Account:\s*(\d+)/)?.[1] ?? "";

  // Reading order: page by page, top to bottom (PDF y grows upwards).
  const ordered = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: MetaBillingLine[] = [];
  const sections: MetaBillingSection[] = [];
  let section: MetaBillingSection = { method: null, printedCents: null, parsedCents: 0, count: 0 };
  let currency = "";
  const dates = ordered.filter((i) => i.x < 100 && DATE.test(i.str));
  let next = 0; // next item in reading order not yet consumed by a section marker

  const closeSection = (printed: number | null) => {
    section.printedCents = printed;
    sections.push(section);
    section = { method: null, printedCents: null, parsedCents: 0, count: 0 };
  };

  for (const d of dates) {
    // Section markers between the previous row and this one.
    const at = ordered.indexOf(d);
    for (; next < at; next++) {
      const it = ordered[next];
      if (it.str === "Total amount billed") closeSection(totalBeside(ordered, it));
      const pm = it.str.match(/^Payment Method:\s*(.+)$/);
      if (pm) section.method = pm[1].trim();
    }
    next = at + 1;
    // The row's band: its own line ± the wrapped lines (rows are ~35 pt apart, wraps ~4.4 pt).
    const band = items.filter((i) => i !== d && i.page === d.page && Math.abs(i.y - d.y) < 8);
    const amounts = band.filter((i) => metaAmount(i.str));
    if (amounts.length !== 1) {
      throw new Error(`Could not read the Meta row dated ${d.str} (found ${amounts.length} amounts).`);
    }
    const amount = amounts[0];
    const [cents, cur] = metaAmount(amount.str)!;
    const rest = band.filter((i) => i !== amount);
    const status = rest.filter((i) => i.x > amount.x);
    if (status.length !== 1) throw new Error(`Could not read the status of the Meta row dated ${d.str}.`);
    const before = rest.filter((i) => i.x < amount.x).sort((a, b) => a.x - b.x || b.y - a.y);
    const ids = before.filter((i) => /^[\d-]+$/.test(i.str));
    const descItem = before.find((i) => /^Meta ads /i.test(i.str));
    const methodItems = before.filter((i) => !ids.includes(i) && i !== descItem).sort((a, b) => b.y - a.y);
    const method = methodItems.map((i) => i.str).join(" ").trim() || section.method || "";
    if (currency && cur !== currency) throw new Error(`The Meta report mixes currencies (${currency}, ${cur}).`);
    currency = cur;
    lines.push({
      dateISO: ddmmyyyy(d.str)!,
      transactionId: ids.sort((a, b) => b.y - a.y).map((i) => i.str).join(""),
      description: descItem?.str ?? "",
      method,
      cardLast4: method.match(/(\d{4})\s*$/)?.[1] ?? null,
      cents,
      currency: cur,
      status: status[0].str,
    });
    section.parsedCents += cents;
    section.count++;
  }
  // Markers after the last row (its section's total).
  for (; next < ordered.length; next++) {
    const it = ordered[next];
    if (it.str === "Total amount billed") closeSection(totalBeside(ordered, it));
  }
  if (section.count) sections.push(section); // rows with no printed total: cannot be checked

  if (!lines.length) throw new Error("No payments were found in the Meta billing report.");
  return {
    account,
    periodStartISO: ddmmyyyy(period[1])!,
    periodEndISO: ddmmyyyy(period[2])!,
    currency,
    lines,
    sections,
    totalsMatch: sections.length > 0 && sections.every((s) => s.printedCents !== null && s.printedCents === s.parsedCents),
  };
}

/** The amount printed to the right of a "Total amount billed" label. */
function totalBeside(items: PdfTextItem[], label: PdfTextItem): number | null {
  const v = items.find((i) => i.page === label.page && Math.abs(i.y - label.y) < 1 && i.x > label.x && metaAmount(i.str));
  return v ? metaAmount(v.str)![0] : null;
}

export async function parseMetaBilling(buffer: ArrayBuffer | Buffer): Promise<MetaBillingReport> {
  return parseMetaBillingItems(await extractPdfItems(buffer));
}

// ── Reconciliation ──────────────────────────────────────────────────────────

export interface FbCharge {
  dateISO: string;
  description: string;
  /** The WorldFirst row: money out in the account currency (EUR or SEK). */
  accountCents: number;
  accountCurrency: string;
  /** What the card was charged in the merchant's currency (SEK). */
  chargedCents: number;
  chargedCurrency: string;
  /** Linked refunds in this statement, account currency. */
  refundedCents: number;
  refunds: number;
  status: string;
  cardLast4: string;
  /** SEK kept after the refunds; null when nothing is kept or it cannot be known yet. */
  keptCents: number | null;
  /** True when keptCents is worked out from EUR figures (a partial refund). */
  estimated: boolean;
  /**
   * Matched although WorldFirst shows no refund: the status says partially
   * refunded and Meta's row is below the charge by less than one euro cent, a
   * refund too small to show in EUR (Oct 6, SEK 2,275.00 → Meta SEK 2,274.99,
   * plus Meta's own "-SEK0.01" refund row).
   */
  tinyRefund?: boolean;
}

export interface MetaMatch {
  charge: FbCharge;
  meta: MetaBillingLine;
  /** Meta − WorldFirst, in cents of the Meta currency. */
  diffCents: number;
  /** Meta date − WorldFirst date. */
  dayDiff: number;
}

export interface MetaReconciliation {
  currency: string;
  /** Card(s) the WorldFirst Facebook charges were made with. */
  cards: string[];
  matched: MetaMatch[];
  /** Refunded in full in this statement: Meta lists nothing for them. */
  fullyRefunded: FbCharge[];
  /** WorldFirst says refunded, but the refund is not in this statement (next month's): Meta's row comes later. */
  refundPending: FbCharge[];
  /** Charged in another currency than Meta's report: cannot be compared. */
  otherCurrency: FbCharge[];
  /** Should be on Meta's report but no row fits. */
  chargesWithoutMeta: FbCharge[];
  /** Meta rows paid another way (another card, "N/A", ad credit): not on WorldFirst. */
  metaOtherPayment: MetaBillingLine[];
  /** Meta rows paid with the WorldFirst card that no charge fits. */
  metaWithoutCharge: MetaBillingLine[];
  totals: {
    metaCents: number;
    metaOnCardsCents: number;
    matchedMetaCents: number;
    matchedWorldFirstCents: number;
  };
}

const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
/** Meta's row is dated from 1 day before to 2 days after the WorldFirst charge (October 2026). */
const DAY_WINDOW: [number, number] = [-1, 2];

/** Pure: WorldFirst Facebook charges (StatementDetail export) vs Meta's billing report. */
export function reconcileMeta(statement: AmexStatement, report: MetaBillingReport): MetaReconciliation {
  const lines = statement.lines;
  if (!lines.some((l) => l.wf)) {
    throw new Error("Please use the WorldFirst .xlsx export (StatementDetail): only it links refunds to charges and shows the SEK amount.");
  }
  const links = linkRefundsByReference(lines);
  const refundsOf = new Map<number, number[]>();
  for (const [r, c] of links) refundsOf.set(c, [...(refundsOf.get(c) ?? []), r]);

  const charges: FbCharge[] = [];
  lines.forEach((l, j) => {
    if (!l.wf || l.wf.type !== "Card payment" || l.originalCents <= 0) return;
    if (typeOf(l.description, l.originalCents).category !== "facebook-ads") return;
    const refs = refundsOf.get(j) ?? [];
    const refunded = refs.reduce((s, r) => s - lines[r].originalCents, 0);
    const charged = l.wf.chargedCents ?? l.originalCents;
    const kept = l.originalCents - refunded;
    const saysRefunded = /refund/i.test(l.wf.status);
    // Refund announced by the status but not (fully) in this statement: Meta's net row is not knowable yet.
    const pending = saysRefunded && (refunded === 0 || (/^refunded$/i.test(l.wf.status) && kept !== 0));
    charges.push({
      dateISO: l.processDateISO,
      description: l.description,
      accountCents: l.originalCents,
      accountCurrency: l.originalCurrency,
      chargedCents: charged,
      chargedCurrency: l.wf.chargedCurrency || l.originalCurrency,
      refundedCents: refunded,
      refunds: refs.length,
      status: l.wf.status,
      cardLast4: l.wf.cardLast4,
      keptCents:
        pending || kept <= 0 ? null : refunded === 0 ? charged : Math.round((charged * kept) / l.originalCents),
      estimated: !pending && kept > 0 && refunded > 0,
    });
  });

  const cards = [...new Set(charges.map((c) => c.cardLast4).filter(Boolean))].sort();
  const rec: MetaReconciliation = {
    currency: report.currency,
    cards,
    matched: [],
    fullyRefunded: [],
    refundPending: [],
    otherCurrency: [],
    chargesWithoutMeta: [],
    metaOtherPayment: [],
    metaWithoutCharge: [],
    totals: { metaCents: 0, metaOnCardsCents: 0, matchedMetaCents: 0, matchedWorldFirstCents: 0 },
  };

  const onCard = (m: MetaBillingLine) => m.cardLast4 !== null && cards.includes(m.cardLast4);
  const used = new Set<number>();
  const toMatch: FbCharge[] = [];
  for (const c of charges) {
    if (c.accountCents - c.refundedCents <= 0) rec.fullyRefunded.push(c);
    else if (c.keptCents === null) rec.refundPending.push(c);
    else if (c.chargedCurrency !== report.currency) rec.otherCurrency.push(c);
    else toMatch.push(c);
  }
  /** SEK of one euro cent on this charge (+1 öre for rounding): how far a worked-out amount may be off. */
  const oneCent = (c: FbCharge) => Math.ceil(c.chargedCents / c.accountCents) + 1;
  /** Best unused Meta row on the same card, in the date window, whose amount fits; -1 if none. */
  const find = (c: FbCharge, fits: (metaCents: number) => number | null) => {
    let best = -1;
    let bestKey: [number, number] = [Infinity, Infinity];
    report.lines.forEach((m, k) => {
      if (used.has(k) || m.cardLast4 !== c.cardLast4 || m.currency !== c.chargedCurrency) return;
      const dd = days(m.dateISO, c.dateISO);
      const diff = fits(m.cents);
      if (dd < DAY_WINDOW[0] || dd > DAY_WINDOW[1] || diff === null) return;
      if (diff < bestKey[0] || (diff === bestKey[0] && Math.abs(dd) < bestKey[1])) {
        best = k;
        bestKey = [diff, Math.abs(dd)];
      }
    });
    return best;
  };
  const take = (c: FbCharge, k: number) => {
    used.add(k);
    const m = report.lines[k];
    rec.matched.push({ charge: c, meta: m, diffCents: m.cents - c.keptCents!, dayDiff: days(m.dateISO, c.dateISO) });
  };

  // Exact amounts first, then the worked-out ones; oldest first within each.
  toMatch.sort((a, b) => Number(a.estimated) - Number(b.estimated) || a.dateISO.localeCompare(b.dateISO));
  for (const c of toMatch) {
    // Exact: to the öre. Worked out from EUR: off by at most one euro cent in SEK.
    const tol = c.estimated ? oneCent(c) : 0;
    const k = find(c, (m) => (Math.abs(m - c.keptCents!) <= tol ? Math.abs(m - c.keptCents!) : null));
    if (k < 0) rec.chargesWithoutMeta.push(c);
    else take(c, k);
  }

  // Refund announced but none in the statement: a refund under one euro cent never shows in EUR.
  // Matched only to a Meta row on the same card at most one euro cent BELOW the charge; else it stays pending.
  for (const c of [...rec.refundPending]) {
    if (c.refundedCents !== 0 || c.chargedCurrency !== report.currency) continue;
    const k = find(c, (m) => (m < c.chargedCents && c.chargedCents - m <= oneCent(c) ? c.chargedCents - m : null));
    if (k < 0) continue;
    rec.refundPending.splice(rec.refundPending.indexOf(c), 1);
    c.keptCents = c.chargedCents; // what WorldFirst shows; the difference to Meta stays visible
    c.tinyRefund = true;
    take(c, k);
  }
  report.lines.forEach((m, k) => {
    rec.totals.metaCents += m.cents;
    if (onCard(m)) rec.totals.metaOnCardsCents += m.cents;
    if (used.has(k)) return;
    (onCard(m) ? rec.metaWithoutCharge : rec.metaOtherPayment).push(m);
  });
  rec.matched.sort((a, b) => a.charge.dateISO.localeCompare(b.charge.dateISO));
  for (const x of rec.matched) {
    rec.totals.matchedMetaCents += x.meta.cents;
    rec.totals.matchedWorldFirstCents += x.charge.keptCents!;
  }
  return rec;
}

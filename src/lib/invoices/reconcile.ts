import { daysBetween } from "./dates";
import type { Invoice, InvoiceMatch, Payment, Reconciliation } from "./types";

const DEFAULT_TOLERANCE_DAYS = 3;

/**
 * Match invoices to statement payments by equal amount and a small date
 * tolerance (invoice dates run 1-2 days before the payment settles). Greedy:
 * each invoice takes the nearest-dated unused payment of the same amount.
 * Whatever is left over is surfaced on both sides.
 */
export function reconcile(
  payments: Payment[],
  invoices: Invoice[],
  toleranceDays = DEFAULT_TOLERANCE_DAYS,
): Reconciliation {
  const readable = invoices.filter((i) => !i.error);
  const unreadable = invoices.filter((i) => i.error);

  const usedPayment = new Set<number>();
  const matched: InvoiceMatch[] = [];
  const invoicesWithoutPayment: Invoice[] = [];

  // Match invoices earliest-first for stable, predictable pairing.
  const ordered = [...readable].sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  for (const invoice of ordered) {
    let best = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < payments.length; i++) {
      if (usedPayment.has(i)) continue;
      if (payments[i].cents !== invoice.cents) continue;
      const diff = daysBetween(invoice.dateISO, payments[i].dateISO);
      if (diff <= toleranceDays && diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    if (best >= 0) {
      usedPayment.add(best);
      matched.push({ invoice, payment: payments[best], dayDiff: bestDiff });
    } else {
      invoicesWithoutPayment.push(invoice);
    }
  }

  const paymentsWithoutInvoice = payments.filter((_, i) => !usedPayment.has(i));

  return {
    toleranceDays,
    matched,
    invoicesWithoutPayment,
    paymentsWithoutInvoice,
    invoiceTotalCents: readable.reduce((s, i) => s + i.cents, 0),
    paymentTotalCents: payments.reduce((s, p) => s + p.cents, 0),
    unreadable,
  };
}

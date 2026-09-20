/**
 * Deterministic insights for the Income Summary (Project 1, M2).
 *
 * Every number here is computed in plain code from the already-parsed summary,
 * NEVER by an LLM. This produces (a) anomaly FLAGS worth a human glance and
 * (b) a compact stats block that the AI narrative is allowed to phrase (but
 * never to invent — see narrative.ts). Keeping this pure and dependency-free
 * makes it unit-testable and keeps the money math auditable.
 */

import type { IncomeSummary } from "./types";

export type AnomalyCode = "mixed-currencies" | "duplicate-amount" | "large-outlier";

/** A single flag worth a human glance. Carries scalars only so the UI can
 *  localize the wording (no English baked into the data). */
export interface IncomeAnomaly {
  code: AnomalyCode;
  severity: "info" | "warn";
  /** Primary count (currencies, rows in a duplicate group, or outlier rows). */
  count: number;
  /** Representative amount in integer cents, when relevant. */
  cents?: number;
  /** Currency the amount belongs to, when relevant. */
  currency?: string;
  /** Source row numbers involved (best-effort, for the reader). */
  rows?: number[];
}

/** Deterministic stats used both by the UI and as grounding for the AI note. */
export interface IncomeStats {
  primaryCurrency: string;
  primaryTotalCents: number;
  countedRows: number;
  currencyCount: number;
  negativeCount: number;
  skippedCount: number;
  largestCents: number;
  smallestCents: number;
  medianCents: number;
}

export interface IncomeInsights {
  anomalies: IncomeAnomaly[];
  stats: IncomeStats;
}

/** How many rows a value must repeat across before we flag it (info). */
const DUP_MIN_ROWS = 2;
/** Cap on how many duplicate groups we surface, largest first, to avoid noise. */
const DUP_MAX_GROUPS = 5;
/** An amount is an outlier when it exceeds this multiple of the median row. */
const OUTLIER_FACTOR = 5;
/** Need at least this many rows before an "outlier" is meaningful. */
const OUTLIER_MIN_ROWS = 4;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/**
 * Compute anomaly flags + stats from a parsed summary. All figures are derived
 * from `summary` (itself produced by the deterministic parser).
 */
export function computeInsights(summary: IncomeSummary): IncomeInsights {
  const primary = summary.totalsByCurrency[0];
  const primaryCurrency = primary?.currency ?? "";
  // Focus row-level stats on the primary currency so median/outliers are
  // comparing like with like.
  const primaryRows = summary.rows.filter((r) => r.currency === primaryCurrency);
  const absCents = primaryRows.map((r) => Math.abs(r.cents));

  const anomalies: IncomeAnomaly[] = [];

  // 1. Mixed currencies — the headline shows only the primary one, so flag it.
  if (summary.totalsByCurrency.length > 1) {
    anomalies.push({
      code: "mixed-currencies",
      severity: "warn",
      count: summary.totalsByCurrency.length,
    });
  }

  // 2. Duplicate amounts — same value in more than one row. Often innocent, but
  //    a quick duplicate-payment check is cheap. Info only.
  const byValue = new Map<number, number[]>();
  for (const row of primaryRows) {
    const list = byValue.get(row.cents) ?? [];
    list.push(row.rowNumber);
    byValue.set(row.cents, list);
  }
  const dupGroups = [...byValue.entries()]
    .filter(([, rows]) => rows.length >= DUP_MIN_ROWS)
    .sort((a, b) => b[1].length - a[1].length || Math.abs(b[0]) - Math.abs(a[0]))
    .slice(0, DUP_MAX_GROUPS);
  for (const [cents, rows] of dupGroups) {
    anomalies.push({
      code: "duplicate-amount",
      severity: "info",
      count: rows.length,
      cents,
      currency: primaryCurrency,
      rows,
    });
  }

  // 3. Large outliers — a row far above the typical size can be a data error.
  const med = median(absCents);
  if (primaryRows.length >= OUTLIER_MIN_ROWS && med > 0) {
    const threshold = med * OUTLIER_FACTOR;
    const outliers = primaryRows
      .filter((r) => Math.abs(r.cents) > threshold)
      .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
    if (outliers.length > 0) {
      anomalies.push({
        code: "large-outlier",
        severity: "info",
        count: outliers.length,
        cents: outliers[0].cents,
        currency: primaryCurrency,
        rows: outliers.map((r) => r.rowNumber),
      });
    }
  }

  const stats: IncomeStats = {
    primaryCurrency,
    primaryTotalCents: primary?.cents ?? 0,
    countedRows: summary.rows.length,
    currencyCount: summary.totalsByCurrency.length,
    negativeCount: summary.negativeCount,
    skippedCount: summary.skipped.length,
    largestCents: absCents.length ? Math.max(...absCents) : 0,
    smallestCents: absCents.length ? Math.min(...absCents) : 0,
    medianCents: med,
  };

  return { anomalies, stats };
}

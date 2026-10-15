import type { AmexStatement } from "./types";

/**
 * Check several statements against one set of receipts at once, e.g. the Amex
 * statement and the WorldFirst export for the same month. Veronica files a
 * receipt in either card's folder, so a receipt only counts as "no charge"
 * when NEITHER statement has the charge.
 *
 * The lines are concatenated (each tagged with `part`, its statement's index)
 * and the period becomes the union of the periods. Per-statement facts (card,
 * printed total, totals check) stay on the parts, which the caller keeps.
 * One statement passes through unchanged apart from the `part` tag.
 */
export function combineStatements(parts: AmexStatement[]): AmexStatement {
  if (parts.length === 0) throw new Error("No statement to check.");
  const lines = parts.flatMap((s, part) => s.lines.map((l) => ({ ...l, part })));
  if (parts.length === 1) return { ...parts[0], lines };

  const starts = parts.map((s) => s.periodStartISO).filter(Boolean).sort();
  const ends = parts.map((s) => s.periodEndISO).filter(Boolean).sort();
  return {
    source: "combined",
    statementDateISO: parts.map((s) => s.statementDateISO).sort().at(-1) ?? "",
    periodStartISO: starts[0] ?? "",
    periodEndISO: ends.at(-1) ?? "",
    periods: parts.map((s) => [s.periodStartISO, s.periodEndISO]),
    cardEnding: "",
    lines,
    // Mixed cards and currencies: a summed total means nothing, the parts keep theirs.
    printedPurchasesCents: null,
    parsedPurchasesCents: 0,
    totalsMatch: parts.every((s) => s.totalsMatch),
  };
}

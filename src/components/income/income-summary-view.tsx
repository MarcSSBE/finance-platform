"use client";

import { BadgeCheck, Download, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/income/money";
import type { IncomeSummary, SkippedRow } from "@/lib/income/types";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/language-provider";
import type { Messages } from "@/lib/i18n/messages";

export function IncomeSummaryView({
  summary,
  onExport,
  onReset,
  exporting,
}: {
  summary: IncomeSummary;
  onExport: () => void;
  onReset: () => void;
  exporting: boolean;
}) {
  const t = useT();
  const primary = summary.totalsByCurrency[0];
  const others = summary.totalsByCurrency.slice(1);
  const clean = summary.skipped.length === 0;

  return (
    <div className="space-y-8">
      {/* Headline total — the ledger's tie-out line, not a metric card. */}
      <section className="rounded-lg border border-rule bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6 sm:p-8">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{t.income.totalIncome}</p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="tabular font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                {primary ? formatCents(primary.cents) : "0.00"}
              </span>
              <span className="text-lg font-medium text-muted-foreground">
                {primary?.currency ?? ""}
              </span>
            </div>
            <p className="mt-3 max-w-prose text-sm text-muted-foreground">
              {t.income.countedFrom(
                primary?.count ?? 0,
                summary.amountColumn,
                summary.amountHeader,
              )}
            </p>
          </div>

          <StatusChip clean={clean} skipped={summary.skipped.length} t={t} />
        </div>

        {others.length > 0 && (
          <div className="border-t border-rule px-6 py-4 sm:px-8">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.income.otherCurrencies}
            </p>
            <ul className="space-y-1">
              {others.map((c) => (
                <li
                  key={c.currency}
                  className="flex items-baseline justify-between gap-4 text-sm"
                >
                  <span className="text-muted-foreground">
                    {c.currency} · {c.count} {t.income.rowsLabel}
                  </span>
                  <span className="tabular font-mono font-medium tabular-nums">
                    {formatCents(c.cents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* The counted rows, ruled like a ledger. */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">{t.income.countedRows}</h2>
          <span className="text-xs text-muted-foreground">{summary.fileName}</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-rule">
          <Table>
            <TableHeader className="bg-card">
              <TableRow className="border-rule hover:bg-transparent">
                <TableHead className="w-16 text-muted-foreground">
                  {t.income.colRow}
                </TableHead>
                <TableHead className="text-muted-foreground">
                  {t.income.colDescription}
                </TableHead>
                <TableHead className="text-right text-muted-foreground">
                  {t.income.colAmount}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.rows.map((row) => (
                <TableRow key={row.rowNumber} className="border-rule/70">
                  <TableCell className="tabular whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums">
                    {row.rowNumber}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words">
                    {row.description || row.type || "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-right tabular font-mono tabular-nums",
                      row.cents < 0 && "text-status-error",
                    )}
                  >
                    {formatCents(row.cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="bg-card">
              <TableRow className="border-t-2 border-t-foreground/80 hover:bg-transparent">
                <TableCell colSpan={2} className="font-semibold">
                  {t.income.total} {primary ? `(${primary.currency})` : ""}
                </TableCell>
                <TableCell className="text-right tabular font-mono text-base font-semibold tabular-nums text-status-ok">
                  {primary ? formatCents(primary.cents) : "0.00"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </section>

      {/* Anomalies — surfaced, never hidden. */}
      {summary.skipped.length > 0 && (
        <section className="rounded-lg bg-status-warn-soft/60 p-5">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-status-warn" strokeWidth={2} />
            <h2 className="text-sm font-semibold">
              {t.income.notCounted(summary.skipped.length)}
            </h2>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {summary.skipped.map((s) => (
              <li key={s.rowNumber} className="flex items-baseline gap-3">
                <span className="tabular font-mono text-xs text-muted-foreground tabular-nums">
                  {t.income.rowN(s.rowNumber)}
                </span>
                <span className="text-muted-foreground">{translateReason(s, t)}</span>
                {s.raw && (
                  <span className="tabular font-mono text-xs text-muted-foreground/80">
                    &ldquo;{s.raw}&rdquo;
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.negativeCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {t.income.negativeNote(summary.negativeCount)}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-6">
        <Button onClick={onExport} disabled={exporting} className="gap-2">
          <Download className="h-4 w-4" strokeWidth={2} />
          {exporting ? t.income.exporting : t.income.exportBtn}
        </Button>
        <Button variant="ghost" onClick={onReset} className="gap-2 text-muted-foreground">
          <RotateCcw className="h-4 w-4" strokeWidth={2} />
          {t.common.chooseDifferentFile}
        </Button>
      </div>
    </div>
  );
}

function StatusChip({ clean, skipped, t }: { clean: boolean; skipped: number; t: Messages }) {
  if (clean) {
    return (
      <StatusBadge tone="ok" size="md" className="shrink-0" icon={<BadgeCheck className="h-4 w-4" strokeWidth={2} />}>
        {t.income.everyRowCounted}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone="warn" size="md" className="shrink-0" icon={<TriangleAlert className="h-4 w-4" strokeWidth={2} />}>
      {t.income.needLook(skipped)}
    </StatusBadge>
  );
}

/** Map the parser's English reason codes to the current language. */
function translateReason(s: SkippedRow, t: Messages): string {
  if (s.reason === "No amount in this row") return t.income.reasonNoAmount;
  if (s.reason === "Amount is not a number") return t.income.reasonNotNumber;
  return s.reason;
}

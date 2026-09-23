"use client";

import { CheckCircle2, CloudUpload, Download, FileWarning, FolderTree, RotateCcw, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, IconTile } from "@/components/status-badge";
import { formatCents } from "@/lib/amazon/dates";
import type { AmazonBatchResult, AmazonDocType, AmazonInvoice } from "@/lib/amazon/types";
import { useT } from "@/components/i18n/language-provider";
import type { Messages } from "@/lib/i18n/messages";

interface FilingOutcome {
  received: number;
  uploaded: number;
  skipped: number;
  failed: number;
  results: { fileName: string; proposedName: string; outcome: string; error?: string }[];
}

export function AmazonResultsView({
  batch,
  driveEnabled,
  onFileToDrive,
  onDownload,
  onReset,
  filing,
  downloading,
  outcome,
}: {
  batch: AmazonBatchResult;
  driveEnabled: boolean;
  onFileToDrive: () => void;
  onDownload: () => void;
  onReset: () => void;
  filing: boolean;
  downloading: boolean;
  outcome?: FilingOutcome | null;
}) {
  const t = useT();
  const primary = batch.totalsByCurrency[0];
  const others = batch.totalsByCurrency.slice(1);

  return (
    <div className="space-y-8">
      {/* Totals band */}
      <section className="rounded-lg border border-rule bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t.amazon.summary}</p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="tabular font-mono text-3xl font-semibold tabular-nums sm:text-4xl">
                {primary ? formatCents(primary.totalCents) : "0.00"}
              </span>
              <span className="text-lg font-medium text-muted-foreground">
                {primary?.currency ?? ""}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.amazon.invoicesCounted(batch.invoices.length)}
            </p>
          </div>
          {others.length > 0 && (
            <ul className="space-y-1 text-sm">
              {others.map((c) => (
                <li key={c.currency} className="flex items-baseline justify-end gap-3">
                  <span className="text-muted-foreground">{c.currency}</span>
                  <span className="tabular font-mono font-medium tabular-nums">
                    {formatCents(c.totalCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Filing result — an honest reconciliation so a partial run is never
          mistaken for a complete one. */}
      {outcome && (
        <section
          className={`rounded-lg border p-5 ${
            outcome.failed > 0
              ? "border-status-error/40 bg-status-error-soft/40"
              : "border-status-ok/40 bg-status-ok-soft/40"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {outcome.failed > 0 ? (
              <FileWarning className="h-4 w-4 text-status-error" strokeWidth={2} />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-status-ok" strokeWidth={2} />
            )}
            <h2 className="text-sm font-semibold tracking-tight">{t.amazon.filedResultTitle}</h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
            <span className="font-medium">{t.amazon.filedReceived(outcome.received)}</span>
            <span className="text-muted-foreground">{t.amazon.filedUploaded(outcome.uploaded)}</span>
            {outcome.skipped > 0 && (
              <span className="text-muted-foreground">{t.amazon.filedSkipped(outcome.skipped)}</span>
            )}
            {outcome.failed > 0 && (
              <span className="font-medium text-status-error">{t.amazon.filedFailed(outcome.failed)}</span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {outcome.failed > 0 ? t.amazon.filedIncomplete : t.amazon.filedComplete}
          </p>
          {outcome.failed > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-status-error/20 pt-3">
              {outcome.results
                .filter((r) => r.outcome === "error")
                .map((r, i) => (
                  <li key={`${r.fileName}-${i}`} className="flex items-baseline justify-between gap-4 text-xs">
                    <span className="truncate text-muted-foreground">{r.fileName}</span>
                    <span className="shrink-0 text-status-error">{r.error}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {/* Invoice table */}
      {batch.invoices.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-rule">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-card">
                <TableRow className="border-rule hover:bg-transparent">
                  <TableHead className="text-muted-foreground">{t.amazon.colInvoice}</TableHead>
                  <TableHead className="text-muted-foreground">{t.amazon.colCountry}</TableHead>
                  <TableHead className="text-muted-foreground">{t.amazon.colType}</TableHead>
                  <TableHead className="text-muted-foreground">{t.amazon.colDate}</TableHead>
                  <TableHead className="text-right text-muted-foreground">{t.amazon.colAmount}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.invoices.map((inv, i) => (
                  <TableRow key={`${inv.invoiceNumber}-${i}`} className="border-rule/70 align-top">
                    <TableCell className="whitespace-nowrap">
                      <div className="tabular font-mono text-xs">{inv.invoiceNumber || "—"}</div>
                      <div className="mt-1 tabular font-mono text-[0.7rem] text-muted-foreground">
                        {inv.proposedName}
                      </div>
                      {inv.needsReview && (
                        <StatusBadge tone="ai" className="mt-1" icon={<ScanLine className="h-3 w-3" strokeWidth={2} />}>
                          {t.amazon.readByAi}
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{inv.country || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {docTypeLabel(inv.docType, t)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums">
                      {inv.dateISO || "—"}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-mono tabular-nums">
                      {inv.currency} {formatCents(inv.totalCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Unreadable */}
      {batch.unreadable.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2.5">
            <IconTile tone="error" icon={<FileWarning className="h-3.5 w-3.5" strokeWidth={2} />} />
            <h2 className="text-sm font-semibold tracking-tight">{t.amazon.bUnreadable}</h2>
            <span className="tabular font-mono text-xs text-muted-foreground tabular-nums">
              {batch.unreadable.length}
            </span>
          </div>
          <ul className="divide-y divide-rule/70 overflow-hidden rounded-lg border border-rule bg-card">
            {batch.unreadable.map((inv, i) => (
              <li key={`${inv.fileName}-${i}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="truncate text-muted-foreground">{inv.fileName}</span>
                <span className="text-xs text-status-error">{inv.error}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Actions */}
      <div className="space-y-3 border-t border-rule pt-6">
        <div className="flex flex-wrap items-center gap-3">
          {driveEnabled && (
            <Button onClick={onFileToDrive} disabled={filing} className="gap-2">
              <CloudUpload className="h-4 w-4" strokeWidth={2} />
              {filing ? t.amazon.filing : t.amazon.fileToDrive}
            </Button>
          )}
          <Button
            variant={driveEnabled ? "outline" : "default"}
            onClick={onDownload}
            disabled={downloading}
            className="gap-2"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            {downloading ? t.amazon.preparing : t.amazon.downloadZip}
          </Button>
          <Button variant="ghost" onClick={onReset} className="gap-2 text-muted-foreground">
            <RotateCcw className="h-4 w-4" strokeWidth={2} /> {t.common.startOver}
          </Button>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <FolderTree className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {t.amazon.zipNote}
        </p>
        <p className="text-xs text-muted-foreground/80">{t.amazon.provisionalNote}</p>
      </div>
    </div>
  );
}

function docTypeLabel(d: AmazonDocType, t: Messages): string {
  switch (d) {
    case "merchant-vat-invoice":
      return t.amazon.docMerchant;
    case "fba-tax-invoice":
      return t.amazon.docFba;
    case "merchant-credit-note":
      return t.amazon.docCreditMerchant;
    case "fba-credit-note":
      return t.amazon.docCreditFba;
    case "epr-service-invoice":
      return t.amazon.docEpr;
    default:
      return t.amazon.docOther;
  }
}

export type { AmazonInvoice };

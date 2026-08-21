"use client";

import {
  BadgeCheck,
  CloudUpload,
  Download,
  FileClock,
  FileWarning,
  FileX,
  FolderTree,
  RotateCcw,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/invoices/dates";
import type { Invoice, Reconciliation } from "@/lib/invoices/types";
import { useT } from "@/components/i18n/language-provider";
import type { Messages } from "@/lib/i18n/messages";
import { IconTile, StatusBadge } from "@/components/status-badge";

export function ReconcileView({
  reconciliation,
  onDownload,
  onReset,
  downloading,
  driveEnabled,
  onFileToDrive,
  filing,
}: {
  reconciliation: Reconciliation;
  onDownload: () => void;
  onReset: () => void;
  downloading: boolean;
  driveEnabled: boolean;
  onFileToDrive: () => void;
  filing: boolean;
}) {
  const t = useT();
  const r = reconciliation;
  const readableCount = r.matched.length + r.invoicesWithoutPayment.length;
  const clean = r.paymentsWithoutInvoice.length === 0 && r.invoicesWithoutPayment.length === 0 && r.unreadable.length === 0;
  const diff = r.paymentTotalCents - r.invoiceTotalCents;

  return (
    <div className="space-y-8">
      {/* Reconciliation summary band */}
      <section className="rounded-lg border border-rule bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t.ads.reconciliation}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <Stat n={r.matched.length} label={t.ads.matched} />
              <Stat n={r.paymentsWithoutInvoice.length} label={t.ads.paymentsNoInvoiceShort} tone={r.paymentsWithoutInvoice.length ? "error" : undefined} />
              <Stat n={r.invoicesWithoutPayment.length} label={t.ads.invoicesNoPaymentShort} tone={r.invoicesWithoutPayment.length ? "warn" : undefined} />
            </div>
          </div>
          {clean ? (
            <StatusBadge tone="ok" size="md" className="shrink-0" icon={<BadgeCheck className="h-4 w-4" strokeWidth={2} />}>
              {t.ads.fullyReconciled}
            </StatusBadge>
          ) : (
            <StatusBadge tone="warn" size="md" className="shrink-0" icon={<TriangleAlert className="h-4 w-4" strokeWidth={2} />}>
              {t.ads.needsLook}
            </StatusBadge>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-1 border-t border-rule pt-4 text-sm sm:grid-cols-2">
          <Row label={t.ads.invoicesTotal(readableCount)} value={formatCents(r.invoiceTotalCents)} />
          <Row label={t.ads.statementTotal} value={formatCents(r.paymentTotalCents)} />
          {diff !== 0 && (
            <Row
              label={t.ads.difference}
              value={`${diff > 0 ? "+" : ""}${formatCents(diff)}`}
              tone="warn"
            />
          )}
        </div>
      </section>

      {/* Matched — with the proposed filename + Drive path */}
      {r.matched.length > 0 && (
        <Bucket title={t.ads.bMatched} tone="ok" icon={<BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} />} count={r.matched.length}>
          {r.matched.map((m) => (
            <li key={m.invoice.fileName} className="px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="tabular font-mono text-sm font-medium tabular-nums">
                  ${formatCents(m.invoice.cents)}
                </span>
                <StatusBadge tone="ok" icon={<BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} />}>
                  {t.ads.paidOn(m.payment.dateISO)}
                  {m.dayDiff > 0 && <span className="opacity-60">· {m.dayDiff}d</span>}
                </StatusBadge>
              </div>
              <FileLine invoice={m.invoice} t={t} />
            </li>
          ))}
        </Bucket>
      )}

      {/* Payments with no invoice — missing document */}
      {r.paymentsWithoutInvoice.length > 0 && (
        <Bucket title={t.ads.bPaymentsNoInvoice} tone="error" icon={<FileX className="h-3.5 w-3.5" strokeWidth={2} />} count={r.paymentsWithoutInvoice.length}>
          {r.paymentsWithoutInvoice.map((p, i) => (
            <li key={`${p.dateISO}-${i}`} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="tabular font-mono text-sm font-medium tabular-nums">${formatCents(p.cents)}</span>
              <StatusBadge tone="error" icon={<FileX className="h-3.5 w-3.5" strokeWidth={2} />}>
                {t.ads.paidOn(p.dateISO)} · {t.ads.invoiceMissing}
              </StatusBadge>
            </li>
          ))}
        </Bucket>
      )}

      {/* Invoices with no payment — orphan invoice */}
      {r.invoicesWithoutPayment.length > 0 && (
        <Bucket title={t.ads.bInvoicesNoPayment} tone="warn" icon={<FileClock className="h-3.5 w-3.5" strokeWidth={2} />} count={r.invoicesWithoutPayment.length}>
          {r.invoicesWithoutPayment.map((inv) => (
            <li key={inv.fileName} className="px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="tabular font-mono text-sm font-medium tabular-nums">${formatCents(inv.cents)}</span>
                <StatusBadge tone="warn" icon={<FileClock className="h-3.5 w-3.5" strokeWidth={2} />}>
                  {t.ads.noMatchingPayment}
                </StatusBadge>
              </div>
              <FileLine invoice={inv} t={t} />
            </li>
          ))}
        </Bucket>
      )}

      {/* Unreadable */}
      {r.unreadable.length > 0 && (
        <Bucket title={t.ads.bUnreadable} tone="error" icon={<FileWarning className="h-3.5 w-3.5" strokeWidth={2} />} count={r.unreadable.length}>
          {r.unreadable.map((inv) => (
            <li key={inv.fileName} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="truncate text-muted-foreground">{inv.fileName}</span>
              <span className="text-xs text-status-error">{inv.error}</span>
            </li>
          ))}
        </Bucket>
      )}

      {/* Actions */}
      <div className="space-y-3 border-t border-rule pt-6">
        <div className="flex flex-wrap items-center gap-3">
          {driveEnabled && (
            <Button onClick={onFileToDrive} disabled={filing} className="gap-2">
              <CloudUpload className="h-4 w-4" strokeWidth={2} />
              {filing ? t.ads.filing : t.ads.fileToDrive}
            </Button>
          )}
          <Button
            variant={driveEnabled ? "outline" : "default"}
            onClick={onDownload}
            disabled={downloading}
            className="gap-2"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            {downloading ? t.ads.preparing : t.ads.downloadZip}
          </Button>
          <Button variant="ghost" onClick={onReset} className="gap-2 text-muted-foreground">
            <RotateCcw className="h-4 w-4" strokeWidth={2} /> {t.common.startOver}
          </Button>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <FolderTree className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {t.ads.zipNote}
        </p>
      </div>
    </div>
  );
}

function FileLine({ invoice, t }: { invoice: Invoice; t: Messages }) {
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
        <span className="tabular font-mono text-foreground">{invoice.proposedName}</span>
        <span className="hidden sm:inline">·</span>
        <span className="tabular font-mono">{invoice.drivePath}</span>
      </div>
      {invoice.needsReview && (
        <StatusBadge tone="ai" icon={<ScanLine className="h-3 w-3" strokeWidth={2} />}>
          {t.ads.readByAi}
        </StatusBadge>
      )}
    </div>
  );
}

function Bucket({
  title,
  count,
  tone,
  icon,
  children,
}: {
  title: string;
  count: number;
  tone: "ok" | "warn" | "error";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <IconTile tone={tone} icon={icon} />
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span className="tabular font-mono text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </div>
      <ul className="divide-y divide-rule/70 overflow-hidden rounded-lg border border-rule bg-card">
        {children}
      </ul>
    </section>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "warn" | "error" }) {
  const color = tone === "error" ? "text-status-error" : tone === "warn" ? "text-status-warn" : "text-foreground";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`tabular font-mono text-2xl font-semibold tabular-nums ${color}`}>{n}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </span>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular font-mono font-medium tabular-nums ${tone === "warn" ? "text-status-warn" : ""}`}>
        {value}
      </span>
    </div>
  );
}

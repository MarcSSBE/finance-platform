"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InvoiceUploader } from "./invoice-uploader";
import { ReconcileView } from "./reconcile-view";
import { useT } from "@/components/i18n/language-provider";
import type { Reconciliation } from "@/lib/invoices/types";

type Status = "idle" | "working" | "done" | "error";

export function InvoicesWorkbench() {
  const t = useT();
  const [status, setStatus] = useState<Status>("idle");
  const [statement, setStatement] = useState<File[]>([]);
  const [invoices, setInvoices] = useState<File[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [driveEnabled, setDriveEnabled] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [filing, setFiling] = useState(false);

  const canReconcile = statement.length === 1 && invoices.length > 0;

  async function reconcile() {
    setStatus("working");
    setError("");
    try {
      const body = new FormData();
      body.append("statement", statement[0]);
      invoices.forEach((f) => body.append("invoices", f));
      const res = await fetch("/api/invoices/reconcile", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Reconciliation failed.");
      setReconciliation(data.reconciliation as Reconciliation);
      setDriveEnabled(Boolean(data.driveEnabled));
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  async function download() {
    setDownloading(true);
    try {
      const body = new FormData();
      invoices.forEach((f) => body.append("invoices", f));
      const res = await fetch("/api/invoices/download", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Download failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tiktok-invoices-renamed.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t.ads.toastDownloaded, {
        description: t.ads.toastDownloadedDesc,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  async function fileToDrive() {
    setFiling(true);
    try {
      const body = new FormData();
      invoices.forEach((f) => body.append("invoices", f));
      const res = await fetch("/api/invoices/file-to-drive", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t.ads.driveError);
      toast.success(t.ads.filedTitle(data.uploaded), {
        description: t.ads.filedDesc(data.skipped, data.failed),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.ads.driveError);
    } finally {
      setFiling(false);
    }
  }

  function reset() {
    setStatus("idle");
    setStatement([]);
    setInvoices([]);
    setReconciliation(null);
    setError("");
  }

  if (status === "done" && reconciliation) {
    return (
      <ReconcileView
        reconciliation={reconciliation}
        onDownload={download}
        onReset={reset}
        downloading={downloading}
        driveEnabled={driveEnabled}
        onFileToDrive={fileToDrive}
        filing={filing}
      />
    );
  }

  if (status === "working") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rule bg-card/40 px-6 py-20 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-status-ok" strokeWidth={2} />
        <p className="text-sm font-medium">{t.ads.workingTitle}</p>
        <p className="text-sm text-muted-foreground">{t.ads.workingSub}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {status === "error" && (
        <div className="rounded-lg bg-status-error-soft/70 p-4">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-status-error" strokeWidth={2} />
            <p className="text-sm font-medium">{error}</p>
          </div>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <InvoiceUploader
          label={t.ads.statementLabel}
          hint={t.ads.statementHint}
          files={statement}
          onFiles={setStatement}
        />
        <InvoiceUploader
          label={t.ads.invoicesLabel}
          hint={t.ads.invoicesHint}
          multiple
          files={invoices}
          onFiles={setInvoices}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={reconcile} disabled={!canReconcile}>
          {t.ads.reconcile(invoices.length)}
        </Button>
        {!canReconcile && (
          <span className="text-sm text-muted-foreground">{t.ads.addBoth}</span>
        )}
      </div>
    </div>
  );
}

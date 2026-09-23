"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AmazonUploader } from "./amazon-uploader";
import { AmazonResultsView } from "./amazon-results-view";
import { useT } from "@/components/i18n/language-provider";
import type { AmazonBatchResult } from "@/lib/amazon/types";

type Status = "idle" | "working" | "done" | "error";

export interface FilingOutcome {
  received: number;
  uploaded: number;
  skipped: number;
  failed: number;
  results: { fileName: string; proposedName: string; outcome: string; error?: string }[];
}

// Vercel serverless rejects request bodies over ~4.5 MB before they reach the
// route, so warn the user just under that.
const BODY_LIMIT_BYTES = 4.3 * 1024 * 1024;

export function AmazonWorkbench() {
  const t = useT();
  const [status, setStatus] = useState<Status>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [batch, setBatch] = useState<AmazonBatchResult | null>(null);
  const [driveEnabled, setDriveEnabled] = useState(false);
  const [error, setError] = useState("");
  const [filing, setFiling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [outcome, setOutcome] = useState<FilingOutcome | null>(null);

  function warnIfOversized(): boolean {
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > BODY_LIMIT_BYTES) {
      toast.warning(t.amazon.sizeWarn((total / (1024 * 1024)).toFixed(1)));
      return true;
    }
    return false;
  }

  async function process() {
    warnIfOversized();
    setStatus("working");
    setError("");
    setOutcome(null);
    try {
      const body = new FormData();
      files.forEach((f) => body.append("files", f));
      const res = await fetch("/api/amazon/process", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "We could not read those files.");
      setBatch(data.batch as AmazonBatchResult);
      setDriveEnabled(Boolean(data.driveEnabled));
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  async function fileToDrive() {
    warnIfOversized();
    setFiling(true);
    try {
      const body = new FormData();
      files.forEach((f) => body.append("files", f));
      const res = await fetch("/api/amazon/file-to-drive", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t.amazon.driveError);
      setOutcome({
        received: data.received ?? data.results?.length ?? data.uploaded + data.skipped + data.failed,
        uploaded: data.uploaded,
        skipped: data.skipped,
        failed: data.failed,
        results: data.results ?? [],
      });
      const desc = [t.amazon.filedDesc(data.skipped, data.failed), data.notified ? t.ads.slackNotified : ""]
        .filter(Boolean)
        .join(" · ");
      if (data.failed > 0) {
        toast.warning(t.amazon.filedTitle(data.uploaded), { description: desc });
      } else {
        toast.success(t.amazon.filedTitle(data.uploaded), { description: desc });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.amazon.driveError);
    } finally {
      setFiling(false);
    }
  }

  async function download() {
    warnIfOversized();
    setDownloading(true);
    try {
      const body = new FormData();
      files.forEach((f) => body.append("files", f));
      const res = await fetch("/api/amazon/download", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Download failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amazon-invoices-renamed.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t.amazon.toastDownloaded);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  function reset() {
    setStatus("idle");
    setFiles([]);
    setBatch(null);
    setError("");
    setOutcome(null);
  }

  if (status === "done" && batch) {
    return (
      <AmazonResultsView
        batch={batch}
        driveEnabled={driveEnabled}
        onFileToDrive={fileToDrive}
        onDownload={download}
        onReset={reset}
        filing={filing}
        downloading={downloading}
        outcome={outcome}
      />
    );
  }

  if (status === "working") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rule bg-card/40 px-6 py-20 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-status-ok" strokeWidth={2} />
        <p className="text-sm font-medium">{t.amazon.workingTitle}</p>
        <p className="text-sm text-muted-foreground">{t.amazon.workingSub}</p>
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

      <AmazonUploader files={files} onFiles={setFiles} />

      <div className="flex items-center gap-3">
        <Button onClick={process} disabled={files.length === 0}>
          {t.amazon.process(files.length)}
        </Button>
        {files.length === 0 && (
          <span className="text-sm text-muted-foreground">{t.amazon.addFiles}</span>
        )}
      </div>
    </div>
  );
}

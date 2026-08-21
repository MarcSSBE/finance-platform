"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UploadDropzone } from "./upload-dropzone";
import { IncomeSummaryView } from "./income-summary-view";
import { useT } from "@/components/i18n/language-provider";
import type { IncomeSummary } from "@/lib/income/types";

type Status = "idle" | "parsing" | "done" | "error";

export function IncomeWorkbench() {
  const t = useT();
  const [status, setStatus] = useState<Status>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<IncomeSummary | null>(null);
  const [error, setError] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  async function handleFile(next: File) {
    setFile(next);
    setStatus("parsing");
    setError("");
    setSummary(null);
    try {
      const body = new FormData();
      body.append("file", next);
      const res = await fetch("/api/income/summarize", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "We could not read that file.");
      setSummary(data.summary as IncomeSummary);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  async function handleExport() {
    if (!file) return;
    setExporting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/income/export", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Export failed.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const name = match ? decodeURIComponent(match[1]) : "summarized.xlsx";
      triggerDownload(blob, name);
      toast.success(t.income.toastExported, { description: name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  function reset() {
    setStatus("idle");
    setFile(null);
    setSummary(null);
    setError("");
  }

  if (status === "done" && summary) {
    return (
      <IncomeSummaryView
        summary={summary}
        onExport={handleExport}
        onReset={reset}
        exporting={exporting}
      />
    );
  }

  if (status === "parsing") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rule bg-card/40 px-6 py-20 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-status-ok" strokeWidth={2} />
        <p className="text-sm font-medium">{t.income.reading(file?.name ?? "")}</p>
        <p className="text-sm text-muted-foreground">{t.income.readingSub}</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-5">
        <div className="rounded-lg bg-status-error-soft/70 p-5">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-status-error" strokeWidth={2} />
            <h2 className="text-sm font-semibold">{t.income.errTitle}</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" onClick={reset}>
          {t.common.tryAnother}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UploadDropzone onFile={handleFile} />
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        <p className="max-w-prose">{t.income.exportNote}</p>
      </div>
    </div>
  );
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

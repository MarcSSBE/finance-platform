"use client";

import { useRef, useState } from "react";
import { FileStack, Loader2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/language-provider";
import type { MergeResult } from "@/lib/amex/merge";

/** Files (a Drive download ZIP is opened) → name + bytes, skipping folders and system files. */
async function readFiles(files: File[]): Promise<{ name: string; bytes: Uint8Array }[]> {
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const f of files) {
    if (!/\.zip$/i.test(f.name)) {
      out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      continue;
    }
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(f);
    for (const [path, entry] of Object.entries(zip.files)) {
      const name = path.split("/").pop() ?? "";
      if (entry.dir || !name || path.startsWith("__MACOSX/") || /^(\.ds_store|desktop\.ini|thumbs\.db)$/i.test(name)) continue;
      out.push({ name: path, bytes: await entry.async("uint8array") });
    }
  }
  return out;
}

/**
 * One PDF of all receipts for Fortnox. Runs in the browser only: her Amex
 * folder is private, so the files are never uploaded.
 */
export function ReceiptsOnePdf() {
  const t = useT();
  const o = t.onePdf;
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [contents, setContents] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Omit<MergeResult, "pdf"> | null>(null);
  const [error, setError] = useState("");

  async function build(files: File[]) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const inputs = await readFiles(files);
      if (!inputs.length) throw new Error(o.noFiles);
      const { mergeReceipts } = await import("@/lib/amex/merge");
      const name = title.trim() || o.defaultTitle;
      const r = await mergeReceipts(inputs, {
        contentsPage: contents,
        title: name,
        createdISO: new Date().toISOString().slice(0, 10),
      });
      if (!r.added.length) throw new Error(o.nothingAdded);
      const blob = new Blob([r.pdf as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[\\/:*?"<>|]/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setResult({ added: r.added, skipped: r.skipped, totalPages: r.totalPages });
      toast.success(o.done(r.added.length, r.totalPages));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 border-t border-rule pt-8">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{o.title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{o.desc}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".zip,.pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          const fs = [...(e.target.files ?? [])];
          e.target.value = "";
          if (fs.length) void build(fs);
        }}
      />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">{o.nameLabel}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={o.defaultTitle}
            className="h-9 w-56 rounded-md border border-rule bg-background px-2"
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={contents} onChange={(e) => setContents(e.target.checked)} />
          {o.contentsPage}
        </label>
      </div>
      <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={2} />
        ) : (
          <Upload className="mr-2 h-4 w-4" strokeWidth={1.75} />
        )}
        {busy ? o.working : o.choose}
      </Button>
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-status-error-soft/70 p-4 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-error" strokeWidth={2} />
          <p>{error}</p>
        </div>
      )}
      {result && (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <FileStack className="h-4 w-4 text-status-ok" strokeWidth={2} />
            {o.done(result.added.length, result.totalPages)}
          </p>
          {result.skipped.length > 0 && (
            <div className="rounded-lg bg-status-error-soft/70 p-4">
              <p className="font-medium">{o.skippedTitle(result.skipped.length)}</p>
              <ul className="mt-1 list-disc pl-5">
                {result.skipped.map((s) => (
                  <li key={s.name}>
                    {s.name} ({o.reasons[s.reason]})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

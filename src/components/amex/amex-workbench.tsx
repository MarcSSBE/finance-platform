"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/language-provider";
import type { AmexReconciliation, AmexStatement } from "@/lib/amex/types";
import { AmexResultsView } from "./amex-results-view";

type Status = "idle" | "working" | "done" | "error";

/** One receipt as far as matching cares: its file name (+ a key to drop exact repeats). */
interface ReceiptEntry {
  name: string;
  key: string;
}

/**
 * Turn dropped files into receipt names. A ZIP (what Google Drive gives you when
 * you download several files at once) is opened IN THE BROWSER and only the
 * names of the files inside it are read, so nothing is uploaded either way.
 */
async function toReceiptEntries(files: File[]): Promise<ReceiptEntry[]> {
  const out: ReceiptEntry[] = [];
  for (const f of files) {
    if (!/\.zip$/i.test(f.name)) {
      out.push({ name: f.name, key: `${f.name}|${f.size}|${f.lastModified}` });
      continue;
    }
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(f);
    zip.forEach((path, entry) => {
      const name = path.split("/").pop() ?? "";
      if (entry.dir || !name || path.startsWith("__MACOSX/") || /^(\.ds_store|desktop\.ini|thumbs\.db)$/i.test(name)) return;
      out.push({ name, key: `${f.name}|${f.size}|${f.lastModified}|${path}` });
    });
  }
  return out;
}

export function AmexWorkbench() {
  const t = useT();
  const [status, setStatus] = useState<Status>("idle");
  const [statement, setStatement] = useState<File | null>(null);
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);
  const [result, setResult] = useState<{ statement: AmexStatement; reconciliation: AmexReconciliation } | null>(null);
  const [error, setError] = useState("");

  async function check() {
    if (!statement) return;
    setStatus("working");
    setError("");
    try {
      const body = new FormData();
      body.append("statement", statement);
      // Only the names: the naming convention carries vendor, amount and month.
      body.append("receiptNames", JSON.stringify(receipts.map((r) => r.name)));
      const res = await fetch("/api/amex/reconcile", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "We could not read that statement.");
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setStatement(null);
    setReceipts([]);
    setResult(null);
    setError("");
  }

  if (status === "done" && result) {
    return <AmexResultsView statement={result.statement} reconciliation={result.reconciliation} onReset={reset} />;
  }

  if (status === "working") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rule bg-card/40 px-6 py-20 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-status-ok" strokeWidth={2} />
        <p className="text-sm font-medium">{t.amex.workingTitle}</p>
        <p className="text-sm text-muted-foreground">{t.amex.workingSub}</p>
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

      <FileDrop
        label={t.amex.statementLabel}
        hint={t.amex.statementHint}
        accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        names={statement ? [statement.name] : []}
        onFiles={(fs) => setStatement(fs.find((f) => /\.(pdf|xlsx)$/i.test(f.name)) ?? null)}
        clearLabel={t.amex.clear}
      />

      <div className="space-y-2">
        <FileDrop
          label={t.amex.receiptsLabel}
          hint={t.amex.receiptsHint}
          multiple
          names={receipts.map((r) => r.name)}
          onFiles={async (fs) => {
            try {
              const added = await toReceiptEntries(fs);
              setReceipts((prev) => dedupe([...prev, ...added]));
            } catch {
              toast.error(t.amex.zipError);
            }
          }}
          onClear={() => setReceipts([])}
          clearLabel={t.amex.clear}
        />
        <p className="text-xs text-muted-foreground">{t.amex.namingNote}</p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={check} disabled={!statement}>
          {t.amex.check(receipts.length)}
        </Button>
        {!statement && <span className="text-sm text-muted-foreground">{t.amex.needStatement}</span>}
      </div>
    </div>
  );
}

/** The same file dropped twice must not count as two receipts. */
function dedupe(entries: ReceiptEntry[]): ReceiptEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.key)) return false;
    seen.add(e.key);
    return true;
  });
}

function FileDrop({
  label,
  hint,
  accept,
  multiple = false,
  names,
  onFiles,
  onClear,
  clearLabel,
}: {
  label: string;
  hint: string;
  accept?: string;
  multiple?: boolean;
  names: string[];
  onFiles: (files: File[]) => void;
  onClear?: () => void;
  clearLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function take(list: FileList | null) {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        {names.length > 0 && (
          <button
            type="button"
            onClick={() => (onClear ? onClear() : onFiles([]))}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {clearLabel}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
          "border-border bg-card/40 hover:border-status-ok/60 hover:bg-status-ok-soft/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          dragging && "border-status-ok bg-status-ok-soft/60",
        )}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-rule bg-background text-muted-foreground">
          <Plus className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </button>

      {names.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto pt-1">
          {names.map((name, i) => (
            <li key={`${name}-${i}`} className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/language-provider";

/** Upload zone for Amazon tax documents: loose PDFs and/or the Seller Central
 *  Tax Document Library ZIP. Kept local to the amazon module (no cross-import). */
export function AmazonUploader({
  files,
  onFiles,
}: {
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const t = useT();

  function take(list: FileList | null) {
    if (!list) return;
    const accepted = Array.from(list).filter((f) => /\.(pdf|zip)$/i.test(f.name));
    if (accepted.length === 0) return;
    onFiles([...files, ...accepted]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{t.amazon.uploadLabel}</span>
        {files.length > 0 && (
          <button
            type="button"
            onClick={() => onFiles([])}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t.amazon.clear}
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
        <span className="text-sm text-muted-foreground">{t.amazon.uploadHint}</span>
      </button>

      {files.length > 0 && (
        <ul className="space-y-1 pt-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{f.name}</span>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf,.zip,application/zip"
        multiple
        className="sr-only"
        onChange={(e) => take(e.target.files)}
      />
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/language-provider";

export function UploadDropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const t = useT();

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "group flex w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-6 py-16 text-center transition-colors",
          "border-border bg-card/40 hover:border-status-ok/60 hover:bg-status-ok-soft/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          dragging && "border-status-ok bg-status-ok-soft/60",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <span
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full border border-rule bg-background text-muted-foreground transition-colors",
            "group-hover:text-status-ok",
            dragging && "text-status-ok",
          )}
        >
          <Upload className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <span className="space-y-1.5">
          <span className="block text-base font-medium text-foreground">
            {t.income.dropTitle}
          </span>
          <span className="block text-sm text-muted-foreground">{t.income.dropOr}</span>
        </span>
        <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.75} />
          {t.income.dropHint}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

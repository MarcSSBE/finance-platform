"use client";

import { useRef, useState } from "react";
import { BadgeCheck, Copy, FileText, Loader2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLang, useT } from "@/components/i18n/language-provider";
import { formatMoney } from "@/lib/income/money";
import type { TypeBreakdown, TypeGroup } from "@/lib/worldfirst/by-type";

type Status = "idle" | "reading" | "done" | "error";

/** WorldFirst totals by type (Google Ads, TikTok Ads, Facebook ads, TikTok Shop payouts, ...). */
export function WorldFirstTypes() {
  const t = useT();
  const w = t.wfTypes;
  const { lang } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState("");
  const [data, setData] = useState<{ breakdown: TypeBreakdown; fromPdf: boolean } | null>(null);
  const [error, setError] = useState("");

  async function read(file: File) {
    setFileName(file.name);
    setStatus("reading");
    setError("");
    setData(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/worldfirst/types", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "We could not read that file.");
      setData(json);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  async function copyTable(b: TypeBreakdown) {
    // Plain numbers for Excel: no thousands separator, comma decimal in Swedish.
    const num = (c: number) => {
      const s = (c / 100).toFixed(2);
      return lang === "sv" ? s.replace(".", ",") : s;
    };
    const rows = [[w.colType, w.colCurrency, w.colOut, w.colIn, w.colNet, w.colRows].join("\t")];
    for (const g of b.groups)
      for (const x of g.totals)
        rows.push([g.label, x.currency, num(x.outCents), num(x.inCents), num(x.netCents), String(x.count)].join("\t"));
    try {
      await navigator.clipboard.writeText(rows.join("\n"));
      toast.success(w.copied);
    } catch {
      toast.error(w.copyFailed);
    }
  }

  return (
    <section className="space-y-4 border-t border-rule pt-8">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{w.title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{w.desc}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void read(f);
          e.target.value = "";
        }}
      />

      {status === "idle" || status === "error" ? (
        <div className="space-y-3">
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" strokeWidth={1.75} />
            {w.choose}
          </Button>
          {status === "error" && (
            <div className="flex items-start gap-2 rounded-lg bg-status-error-soft/70 p-4 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-error" strokeWidth={2} />
              <p>{error}</p>
            </div>
          )}
        </div>
      ) : status === "reading" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          {w.reading(fileName)}
        </div>
      ) : data ? (
        <Results
          b={data.breakdown}
          fromPdf={data.fromPdf}
          fileName={fileName}
          onCopy={() => void copyTable(data.breakdown)}
          onAnother={() => inputRef.current?.click()}
        />
      ) : null}
    </section>
  );
}

function Results({
  b,
  fromPdf,
  fileName,
  onCopy,
  onAnother,
}: {
  b: TypeBreakdown;
  fromPdf: boolean;
  fileName: string;
  onCopy: () => void;
  onAnother: () => void;
}) {
  const w = useT().wfTypes;
  const unmatched = b.groups.find((g) => g.category === "refund-unmatched");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FileText className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        <span className="font-medium">{fileName}</span>
        <span className="text-muted-foreground">
          {b.periodStartISO} – {b.periodEndISO} · {w.rowsRead(b.rowCount)}
        </span>
      </div>
      {!fromPdf ? (
        <p className="text-sm text-muted-foreground">{w.fromExport}</p>
      ) : b.checked ? (
        <p className="flex items-center gap-2 text-sm text-status-ok">
          <BadgeCheck className="h-4 w-4" strokeWidth={2} />
          {w.checkedOk}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium text-status-error">
          <TriangleAlert className="h-4 w-4" strokeWidth={2} />
          {w.checkedBad}
        </p>
      )}
      {unmatched && <p className="text-sm text-muted-foreground">{w.unmatchedNote(unmatched.lines.length)}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{w.colType}</TableHead>
            <TableHead className="text-right">{w.colOut}</TableHead>
            <TableHead className="text-right">{w.colIn}</TableHead>
            <TableHead className="text-right">{w.colNet}</TableHead>
            <TableHead className="text-right">{w.colRows}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {b.groups.map((g) => (
            <GroupRow key={g.key} g={g} />
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onCopy}>
          <Copy className="mr-2 h-4 w-4" strokeWidth={1.75} />
          {w.copy}
        </Button>
        <Button variant="ghost" onClick={onAnother}>
          {w.another}
        </Button>
      </div>
    </div>
  );
}

function GroupRow({ g }: { g: TypeGroup }) {
  const w = useT().wfTypes;
  const [open, setOpen] = useState(false);
  const cell = (pick: (x: TypeGroup["totals"][number]) => number) =>
    g.totals.map((x) => (
      <div key={x.currency} className="tabular-nums">
        {pick(x) ? formatMoney(pick(x), x.currency) : "–"}
      </div>
    ));
  return (
    <>
      <TableRow className={g.featured ? "bg-muted/40 font-medium" : undefined}>
        <TableCell className="whitespace-normal break-words">
          {g.lines.length ? (
            <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setOpen(!open)}>
              {g.label}
            </button>
          ) : (
            g.label
          )}
        </TableCell>
        {g.lines.length ? (
          <>
            <TableCell className="text-right">{cell((x) => x.outCents)}</TableCell>
            <TableCell className="text-right">{cell((x) => x.inCents)}</TableCell>
            <TableCell className="text-right">{cell((x) => x.netCents)}</TableCell>
            <TableCell className="text-right tabular-nums">{g.lines.length}</TableCell>
          </>
        ) : (
          <TableCell colSpan={4} className="text-right text-muted-foreground">
            {w.none}
          </TableCell>
        )}
      </TableRow>
      {open &&
        g.lines.map((l, i) => (
          <TableRow key={i} className="text-xs text-muted-foreground">
            <TableCell className="whitespace-normal break-words pl-6">
              {l.dateISO} · {l.refundOf ? w.refundOf(l.refundOf.dateISO, l.refundOf.description) : l.description || w.noText}
            </TableCell>
            <TableCell className="text-right tabular-nums">{l.cents > 0 ? formatMoney(l.cents, l.currency) : ""}</TableCell>
            <TableCell className="text-right tabular-nums">{l.cents < 0 ? formatMoney(-l.cents, l.currency) : ""}</TableCell>
            <TableCell />
            <TableCell />
          </TableRow>
        ))}
    </>
  );
}

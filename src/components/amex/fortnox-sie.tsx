"use client";

import { useRef, useState } from "react";
import { FileDown, Loader2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/language-provider";
import { formatCents } from "@/lib/amazon/dates";

interface Decision {
  dateISO: string;
  description: string;
  sekOre: number;
  status: "booked" | "for-you" | "not-in-voucher";
  account: string;
  reason: string;
}
interface SieResult {
  voucher: { dateISO: string; text: string; bookedOre: number; forYouOre: number };
  decisions: Decision[];
  fileName: string;
  sieBase64: string;
}

/** Fortnox SIE file (one voucher) from the Amex statement. The file is downloaded; nothing is sent to Fortnox. */
export function FortnoxSie() {
  const t = useT();
  const s = t.sie;
  const inputRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SieResult | null>(null);
  const [error, setError] = useState("");

  async function build(file: File) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const body = new FormData();
      body.append("statement", file);
      if (date) body.append("date", date);
      const res = await fetch("/api/amex/sie", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "We could not read that statement.");
      const r = data as SieResult;
      setResult(r);
      if (!r.sieBase64) {
        toast.warning(s.nothingBooked);
        return;
      }
      const bytes = Uint8Array.from(atob(r.sieBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(s.downloaded(r.fileName));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const forYou = result?.decisions.filter((d) => d.status === "for-you") ?? [];
  const booked = result?.decisions.filter((d) => d.status === "booked") ?? [];

  return (
    <section className="space-y-4 border-t border-rule pt-8">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{s.title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{s.desc}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void build(f);
        }}
      />
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{s.dateLabel}</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 rounded-md border border-rule bg-background px-2"
        />
        <span className="text-xs text-muted-foreground">{s.dateHint}</span>
      </label>
      <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={2} />
        ) : (
          <Upload className="mr-2 h-4 w-4" strokeWidth={1.75} />
        )}
        {busy ? s.working : s.choose}
      </Button>
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-status-error-soft/70 p-4 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-error" strokeWidth={2} />
          <p>{error}</p>
        </div>
      )}
      {result && (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-status-ok" strokeWidth={2} />
            {s.booked(booked.length, formatCents(result.voucher.bookedOre))} · {result.voucher.text} · {result.voucher.dateISO}
          </p>
          {forYou.length > 0 && (
            <div className="rounded-lg bg-status-error-soft/70 p-4">
              <p className="font-medium">{s.forYou(forYou.length, formatCents(result.voucher.forYouOre))}</p>
              <DecisionTable rows={forYou} t={s} showWhy />
            </div>
          )}
          {booked.length > 0 && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">{s.showBooked}</summary>
              <DecisionTable rows={booked} t={s} />
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function DecisionTable({ rows, t, showWhy }: { rows: Decision[]; t: ReturnType<typeof useT>["sie"]; showWhy?: boolean }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="py-1 pr-3 font-normal">{t.colDate}</th>
            <th className="py-1 pr-3 font-normal">{t.colMerchant}</th>
            <th className="py-1 pr-3 text-right font-normal">{t.colSek}</th>
            <th className="py-1 pr-3 font-normal">{showWhy ? t.colWhy : t.colAccount}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => (
            <tr key={`${d.dateISO}-${i}`} className="border-t border-rule/60 align-top">
              <td className="py-1 pr-3 font-mono tabular-nums">{d.dateISO}</td>
              <td className="py-1 pr-3">{d.description}</td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">{formatCents(d.sekOre)}</td>
              <td className="py-1 pr-3">{showWhy ? d.reason : d.account}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

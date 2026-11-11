"use client";

import { useRef, useState } from "react";
import { BadgeCheck, Loader2, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/components/i18n/language-provider";
import { formatMoney } from "@/lib/income/money";
import type { FbCharge, MetaBillingLine, MetaBillingSection, MetaReconciliation } from "@/lib/worldfirst/meta-billing";

type Status = "idle" | "reading" | "done" | "error";

interface MetaResponse {
  report: {
    account: string;
    periodStartISO: string;
    periodEndISO: string;
    currency: string;
    sections: MetaBillingSection[];
    totalsMatch: boolean;
    lineCount: number;
  };
  reconciliation: MetaReconciliation;
  statementChecked: boolean;
}

/** Facebook ads: the WorldFirst StatementDetail export vs Meta's billing report. */
export function MetaCheck({ statement, detail }: { statement: File | null; detail: boolean }) {
  const w = useT().wfTypes;
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState("");
  const [data, setData] = useState<MetaResponse | null>(null);
  const [error, setError] = useState("");

  if (!detail || !statement) {
    return (
      <section className="space-y-1 border-t border-rule pt-6">
        <h3 className="font-semibold">{w.metaTitle}</h3>
        <p className="max-w-prose text-sm text-muted-foreground">{w.metaNeedsDetail}</p>
      </section>
    );
  }

  async function read(meta: File) {
    setFileName(meta.name);
    setStatus("reading");
    setError("");
    setData(null);
    try {
      const body = new FormData();
      body.append("file", statement!);
      body.append("meta", meta);
      const res = await fetch("/api/worldfirst/meta", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "We could not read those files.");
      setData(json);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <section className="space-y-4 border-t border-rule pt-6">
      <div className="space-y-1">
        <h3 className="font-semibold">{w.metaTitle}</h3>
        <p className="max-w-prose text-sm text-muted-foreground">{w.metaDesc}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
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
            {w.metaChoose}
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
          {w.metaReading(fileName)}
        </div>
      ) : data ? (
        <MetaResults data={data} fileName={fileName} onAnother={() => inputRef.current?.click()} />
      ) : null}
    </section>
  );
}

function MetaResults({ data, fileName, onAnother }: { data: MetaResponse; fileName: string; onAnother: () => void }) {
  const w = useT().wfTypes;
  const [showMatched, setShowMatched] = useState(false);
  const { report, reconciliation: r } = data;
  const cur = r.currency;
  const printed = report.sections.map((s) =>
    s.printedCents === null ? "?" : `${s.method ? `${s.method} ` : ""}${formatMoney(s.printedCents, cur)}`,
  );
  const onCard = r.matched.length + r.metaWithoutCharge.length;
  const cards = r.cards.map((c) => `···· ${c}`).join(", ");
  const nothingOpen = !r.metaWithoutCharge.length && !r.chargesWithoutMeta.length && !r.otherCurrency.length;
  const estimated = r.matched.some((m) => m.charge.estimated);
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-medium">{fileName}</span>{" "}
        <span className="text-muted-foreground">
          {report.periodStartISO} – {report.periodEndISO} · {w.rowsRead(report.lineCount)}
        </span>
      </p>
      {report.totalsMatch ? (
        <p className="flex items-center gap-2 text-sm text-status-ok">
          <BadgeCheck className="h-4 w-4" strokeWidth={2} />
          {w.metaTotalsOk(printed.join(" + "))}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium text-status-error">
          <TriangleAlert className="h-4 w-4" strokeWidth={2} />
          {w.metaTotalsBad}
        </p>
      )}
      {!data.statementChecked && (
        <p className="flex items-center gap-2 text-sm font-medium text-status-error">
          <TriangleAlert className="h-4 w-4" strokeWidth={2} />
          {w.statementBad}
        </p>
      )}
      <p className="text-sm font-medium">
        {w.metaSummary(r.matched.length, onCard, cards, formatMoney(r.totals.matchedMetaCents, cur))}
        {nothingOpen && <span className="ml-1 text-status-ok">{w.metaNothingOpen}</span>}
      </p>

      <OpenMeta title={w.openWithoutCharge} rows={r.metaWithoutCharge} />
      <OpenCharges title={w.openChargesWithoutMeta} rows={r.chargesWithoutMeta} />
      <OpenCharges title={w.openOtherCurrency} rows={r.otherCurrency} />
      <OpenCharges title={w.openRefundPending} rows={r.refundPending} />
      <OpenMeta title={w.openOtherPayment} rows={r.metaOtherPayment} />
      <OpenCharges title={w.openFullyRefunded} rows={r.fullyRefunded} />

      {estimated && <p className="max-w-prose text-xs text-muted-foreground">{w.metaEstimatedNote}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setShowMatched(!showMatched)}>
          {showMatched ? w.hideMatched : w.showMatched(r.matched.length)}
        </Button>
        <Button variant="ghost" onClick={onAnother}>
          {w.metaAnother}
        </Button>
      </div>
      {showMatched && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{w.colCharge}</TableHead>
              <TableHead className="text-right">{w.colCharged}</TableHead>
              <TableHead className="text-right">{w.colRefunded}</TableHead>
              <TableHead className="text-right">{w.colKept}</TableHead>
              <TableHead>{w.colMeta}</TableHead>
              <TableHead className="text-right">{w.colDiff}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.matched.map((m, i) => (
              <TableRow key={i} className="text-xs">
                <TableCell className="whitespace-normal break-words">
                  {m.charge.dateISO} · {m.charge.description}
                  {m.charge.tinyRefund && <span className="text-muted-foreground"> ({w.tinyRefund})</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(m.charge.chargedCents, m.charge.chargedCurrency)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.charge.refundedCents ? formatMoney(m.charge.refundedCents, m.charge.accountCurrency) : "–"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.charge.estimated ? "≈ " : ""}
                  {formatMoney(m.charge.keptCents ?? 0, m.charge.chargedCurrency)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {m.meta.dateISO} · {formatMoney(m.meta.cents, m.meta.currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{m.diffCents ? formatMoney(m.diffCents, cur) : "–"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function OpenMeta({ title, rows }: { title: string; rows: MetaBillingLine[] }) {
  if (!rows.length) return null;
  const sum = rows.reduce((s, m) => s + m.cents, 0);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">
        {title}: {rows.length} · {formatMoney(sum, rows[0].currency)}
      </summary>
      <ul className="mt-1 space-y-0.5 pl-5 text-xs text-muted-foreground">
        {rows.map((m, i) => (
          <li key={i} className="tabular-nums">
            {m.dateISO} · {m.description || "–"} · {m.method} · {formatMoney(m.cents, m.currency)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function OpenCharges({ title, rows }: { title: string; rows: FbCharge[] }) {
  if (!rows.length) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">
        {title}: {rows.length}
      </summary>
      <ul className="mt-1 space-y-0.5 pl-5 text-xs text-muted-foreground">
        {rows.map((c, i) => (
          <li key={i} className="tabular-nums">
            {c.dateISO} · {c.description} · {formatMoney(c.accountCents, c.accountCurrency)} (
            {formatMoney(c.chargedCents, c.chargedCurrency)})
            {c.refundedCents ? ` · −${formatMoney(c.refundedCents, c.accountCurrency)}` : ""} · {c.status}
          </li>
        ))}
      </ul>
    </details>
  );
}

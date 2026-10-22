"use client";

import {
  BadgeCheck,
  CalendarX,
  ClipboardCopy,
  FileQuestion,
  FileStack,
  FileWarning,
  FileX,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconTile, StatusBadge } from "@/components/status-badge";
import { useLang } from "@/components/i18n/language-provider";
import type { AmexLine, AmexReceipt, AmexReconciliation, AmexStatement } from "@/lib/amex/types";

export function AmexResultsView({
  statement,
  parts,
  reconciliation: r,
  onReset,
}: {
  /** What was matched: one statement, or several combined (lines tagged with `part`). */
  statement: AmexStatement;
  /** The uploaded statements, each with its own period, card and totals check. */
  parts: AmexStatement[];
  reconciliation: AmexReconciliation;
  onReset: () => void;
}) {
  const { t, lang } = useLang();
  const a = t.amex;
  const money = (cents: number, currency: string) =>
    `${currency} ${new Intl.NumberFormat(lang === "sv" ? "sv-SE" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)}`;
  const charge = (l: AmexLine) => money(l.originalCents, l.originalCurrency);
  const line = (i: number) => statement.lines[i];

  const needReceipt = statement.lines.filter((l) => l.needsReceipt).length;
  const notNeeded = statement.lines.length - needReceipt;
  const combined = parts.length > 1;
  const partOf = (l: AmexLine) => parts[l.part ?? 0] ?? statement;
  const sourceName = (s: AmexStatement) =>
    s.source === "worldfirst" ? (s.account ? `${a.worldfirst} ${s.account}` : a.worldfirst) : "Amex";
  const tagFor = (l: AmexLine) => (combined ? sourceName(partOf(l)) : undefined);
  const hintFor = new Map(r.hints.map((h) => [h.lineIndex, h.fileNames]));
  const amountHintFor = new Map(r.amountHints.map((h) => [h.lineIndex, h.fileNames]));
  // Receipt file name → the bank transfers it might belong to (shown on the receipt).
  const transferHintFor = new Map<string, string[]>();
  for (const h of r.transferHints ?? []) {
    for (const n of h.fileNames) transferHintFor.set(n, [...(transferHintFor.get(n) ?? []), line(h.lineIndex).description]);
  }
  const clean = r.missing.length === 0 && statement.totalsMatch;

  async function copyMissing() {
    // One block per statement: the WorldFirst list goes to Exelle, the Amex one stays.
    const blocks = parts
      .map((p, pi) => {
        const rows = r.missing
          .filter((i) => (line(i).part ?? 0) === pi)
          .map((i) => `${line(i).dateISO}  ${charge(line(i))}  ${line(i).description}`);
        return rows.length ? [a.copyHeader(sourceName(p), p.periodStartISO, p.periodEndISO), ...rows].join("\n") : "";
      })
      .filter(Boolean);
    const text = blocks.join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(a.copied);
    } catch {
      toast.error(a.copyFailed);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-rule bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {combined ? a.checkedTogether(parts.map(sourceName).join(" + ")) : <PartLabel s={parts[0]} />}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <Stat n={r.matched.length} label={a.matched} />
              <Stat n={r.missing.length} label={a.missingShort} tone={r.missing.length ? "error" : undefined} />
              <Stat n={r.unmatchedReceipts.length} label={a.unmatchedShort} tone={r.unmatchedReceipts.length ? "warn" : undefined} />
            </div>
          </div>
          {clean ? (
            <StatusBadge tone="ok" size="md" className="shrink-0" icon={<BadgeCheck className="h-4 w-4" strokeWidth={2} />}>
              {a.allCovered}
            </StatusBadge>
          ) : (
            <StatusBadge tone="warn" size="md" className="shrink-0" icon={<TriangleAlert className="h-4 w-4" strokeWidth={2} />}>
              {a.needsLook}
            </StatusBadge>
          )}
        </div>

        <div className="mt-5 space-y-1 border-t border-rule pt-4 text-sm">
          <p className="text-muted-foreground">
            {a.needReceipt(needReceipt)} ·{" "}
            {combined
              ? a.notNeededMixed(notNeeded)
              : parts[0].source === "worldfirst"
                ? a.notNeededWf(notNeeded)
                : a.notNeeded(notNeeded)}
          </p>
          {parts.map((p, pi) => (
            <div key={pi} className={combined ? "pt-1" : undefined}>
              {combined && (
                <p className="font-medium">
                  <PartLabel s={p} />
                </p>
              )}
              {p.source === "worldfirst" && !p.totalsMatch ? (
                <p className="font-medium text-status-error">{a.wfTotalBad}</p>
              ) : p.source === "worldfirst" ? (
                <p className="text-muted-foreground">{p.account ? a.wfReadPdf(p.lines.length) : a.wfRead(p.lines.length)}</p>
              ) : p.totalsMatch ? (
                <p className="text-muted-foreground">{a.totalCheckOk(money(p.parsedPurchasesCents, "").trim())}</p>
              ) : (
                <p className="font-medium text-status-error">
                  {a.totalCheckBad(
                    money(p.parsedPurchasesCents, "").trim(),
                    p.printedPurchasesCents === null ? "?" : money(p.printedPurchasesCents, "").trim(),
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {r.missing.length > 0 && (
        <Bucket
          title={a.bMissing}
          tone="error"
          icon={<FileX className="h-3.5 w-3.5" strokeWidth={2} />}
          count={r.missing.length}
          action={
            <Button variant="outline" size="sm" onClick={copyMissing} className="gap-1.5">
              <ClipboardCopy className="h-3.5 w-3.5" strokeWidth={2} /> {a.copyMissing}
            </Button>
          }
        >
          {r.missing.map((i) => (
            <li key={i} className="px-4 py-3">
              <ChargeRow l={line(i)} amount={charge(line(i))} tag={tagFor(line(i))} />
              {hintFor.has(i) && (
                <p className="mt-1.5 text-xs text-status-warn">{a.possible(hintFor.get(i)!.join(", "))}</p>
              )}
              {amountHintFor.has(i) && (
                <p className="mt-1.5 text-xs text-status-warn">{a.amountDiffers(amountHintFor.get(i)!.join(", "))}</p>
              )}
            </li>
          ))}
        </Bucket>
      )}

      {r.unmatchedReceipts.length > 0 && (
        <Bucket
          title={a.bUnmatched}
          tone="warn"
          icon={<FileQuestion className="h-3.5 w-3.5" strokeWidth={2} />}
          count={r.unmatchedReceipts.length}
          note={combined ? a.unmatchedNoteCombined : a.unmatchedNote}
        >
          {r.unmatchedReceipts.map((rc, i) => (
            <ReceiptRow
              key={`${rc.fileName}-${i}`}
              rc={rc}
              hint={transferHintFor.has(rc.fileName) ? a.transferHint(transferHintFor.get(rc.fileName)!.join(", ")) : undefined}
            />
          ))}
        </Bucket>
      )}

      {r.unreadableNames.length > 0 && (
        <Bucket
          title={a.bUnreadable}
          tone="error"
          icon={<FileWarning className="h-3.5 w-3.5" strokeWidth={2} />}
          count={r.unreadableNames.length}
          note={a.unreadableNote}
        >
          {r.unreadableNames.map((n, i) => (
            <li key={`${n}-${i}`} className="truncate px-4 py-3 text-sm text-muted-foreground">
              {n}
            </li>
          ))}
        </Bucket>
      )}

      {r.matched.length > 0 && (
        <Bucket title={a.bMatched} tone="ok" icon={<BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} />} count={r.matched.length}>
          {r.matched.map((m) => {
            const l = line(m.lineIndex);
            return (
              <li key={m.lineIndex} className="px-4 py-3">
                <ChargeRow l={l} amount={charge(l)} tag={tagFor(l)} />
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground">{m.receipt.fileName}</span>
                  {m.dayDiff !== null && m.dayDiff > 0 && <span>· {a.dayOff(m.dayDiff)}</span>}
                  {m.notes.includes("combined") && m.covers && (
                    <span className="inline-flex items-center gap-1">
                      · <FileStack className="h-3 w-3" strokeWidth={2} /> {a.combined(m.covers)}
                    </span>
                  )}
                  {m.notes.includes("billed-later") && <span>· {a.billedLater}</span>}
                  {l.kind === "transfer" && <span>· {a.transferMatch}</span>}
                  {m.notes.includes("currency-differs") && (
                    <StatusBadge tone="warn" icon={<TriangleAlert className="h-3 w-3" strokeWidth={2} />}>
                      {a.currencyDiffers(m.receipt.currency ?? a.noCurrency, l.originalCurrency)}
                    </StatusBadge>
                  )}
                </div>
              </li>
            );
          })}
        </Bucket>
      )}

      {r.outsidePeriod.length > 0 && (
        <Bucket
          title={a.bOutside}
          tone="neutral"
          icon={<CalendarX className="h-3.5 w-3.5" strokeWidth={2} />}
          count={r.outsidePeriod.length}
          note={a.outsideNote}
        >
          {r.outsidePeriod.map((rc, i) => (
            <ReceiptRow key={`${rc.fileName}-${i}`} rc={rc} />
          ))}
        </Bucket>
      )}

      <div className="border-t border-rule pt-6">
        <Button variant="ghost" onClick={onReset} className="gap-2 text-muted-foreground">
          <RotateCcw className="h-4 w-4" strokeWidth={2} /> {t.common.startOver}
        </Button>
      </div>
    </div>
  );
}

function PartLabel({ s }: { s: AmexStatement }) {
  const a = useLang().t.amex;
  return (
    <>
      {s.source === "worldfirst" ? (s.account ? `${a.worldfirst} ${s.account}` : a.worldfirst) : "Amex"} ·{" "}
      {a.period(s.periodStartISO, s.periodEndISO)}
      {s.source !== "worldfirst" && s.cardEnding && <> · {a.card(s.cardEnding)}</>}
    </>
  );
}

function ChargeRow({ l, amount, tag }: { l: AmexLine; amount: string; tag?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="min-w-0 truncate text-sm">
        <span className="tabular mr-3 font-mono text-xs text-muted-foreground tabular-nums">{l.dateISO}</span>
        {tag && (
          <span className="mr-2 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{tag}</span>
        )}
        {l.description}
      </span>
      <span className="tabular shrink-0 font-mono text-sm font-medium tabular-nums">{amount}</span>
    </div>
  );
}

function ReceiptRow({ rc, hint }: { rc: AmexReceipt; hint?: string }) {
  if (!hint) return <li className="truncate px-4 py-3 font-mono text-sm">{rc.fileName}</li>;
  return (
    <li className="px-4 py-3">
      <p className="truncate font-mono text-sm">{rc.fileName}</p>
      <p className="mt-1.5 text-xs text-status-warn">{hint}</p>
    </li>
  );
}

function Bucket({
  title,
  count,
  tone,
  icon,
  note,
  action,
  children,
}: {
  title: string;
  count: number;
  tone: "ok" | "warn" | "error" | "neutral";
  icon: React.ReactNode;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        {tone === "neutral" ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-inset ring-border">
            {icon}
          </span>
        ) : (
          <IconTile tone={tone} icon={icon} />
        )}
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span className="tabular font-mono text-xs text-muted-foreground tabular-nums">{count}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {note && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}
      <ul className="divide-y divide-rule/70 overflow-hidden rounded-lg border border-rule bg-card">{children}</ul>
    </section>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "warn" | "error" }) {
  const color = tone === "error" ? "text-status-error" : tone === "warn" ? "text-status-warn" : "text-foreground";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`tabular font-mono text-2xl font-semibold tabular-nums ${color}`}>{n}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </span>
  );
}

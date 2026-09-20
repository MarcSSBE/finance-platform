"use client";

import { Info, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatCents } from "@/lib/income/money";
import type { IncomeAnomaly } from "@/lib/income/insights";
import { useT } from "@/components/i18n/language-provider";
import type { Messages } from "@/lib/i18n/messages";

/** Client-side shape of the /api/income/insights response. */
export interface InsightsData {
  anomalies: IncomeAnomaly[];
  narrative: string | null;
}

export function IncomeInsights({
  data,
  loading,
}: {
  data: InsightsData | null;
  loading: boolean;
}) {
  const t = useT();

  // Nothing to show at all (AI off, no anomalies, still fetching handled below).
  const hasAnything =
    loading || (data && (data.narrative || data.anomalies.length > 0));
  if (!hasAnything && !data) return null;

  return (
    <section className="rounded-lg border border-rule bg-card">
      <div className="flex items-center gap-2 border-b border-rule px-5 py-3">
        <Sparkles className="h-4 w-4 text-status-ok" strokeWidth={2} />
        <h2 className="text-sm font-semibold tracking-tight">{t.income.insightsTitle}</h2>
        {data?.narrative && (
          <StatusBadge tone="ai" className="ml-auto" icon={<Sparkles className="h-3 w-3" strokeWidth={2} />}>
            {t.income.insightsAiNote}
          </StatusBadge>
        )}
      </div>

      <div className="space-y-4 p-5">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            {t.income.insightsAnalyzing}
          </p>
        )}

        {data?.narrative && (
          <p className="max-w-prose text-sm leading-relaxed text-foreground/90">
            {data.narrative}
          </p>
        )}

        {data && data.anomalies.length > 0 && (
          <ul className="space-y-2">
            {data.anomalies.map((a, i) => (
              <li key={`${a.code}-${i}`} className="flex items-start gap-2.5 text-sm">
                {a.severity === "warn" ? (
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-warn" strokeWidth={2} />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                )}
                <span className="text-muted-foreground">
                  {describe(a, t)}
                  {a.rows && a.rows.length > 0 && (
                    <span className="ml-1.5 tabular font-mono text-xs text-muted-foreground/70 tabular-nums">
                      ({t.income.anomalyRows(a.rows.slice(0, 8).join(", "))}
                      {a.rows.length > 8 ? "…" : ""})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {data && !loading && !data.narrative && data.anomalies.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.income.insightsAllClear}</p>
        )}
      </div>
    </section>
  );
}

/** Map a deterministic anomaly to localized copy. Amounts are formatted in
 *  code (formatCents) and only phrased by the dictionary, never by an LLM. */
function describe(a: IncomeAnomaly, t: Messages): string {
  const amount = a.cents !== undefined ? formatCents(a.cents) : "";
  const currency = a.currency ?? "";
  switch (a.code) {
    case "mixed-currencies":
      return t.income.anomalyMixedCurrencies(a.count);
    case "duplicate-amount":
      return t.income.anomalyDuplicateAmount(amount, currency, a.count);
    case "large-outlier":
      return t.income.anomalyLargeOutlier(amount, currency, a.count);
    default:
      return "";
  }
}

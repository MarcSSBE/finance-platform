/**
 * Slack notifications for the Ads Invoice filing run (Project 2, M5).
 *
 * Fires AFTER invoices are filed to Google Drive, posting a plain summary of
 * what landed where. Every value in the message is deterministic (it comes
 * from the Drive filing results) — no LLM, no money figure is generated here.
 *
 * Inert unless SLACK_TOKEN + SLACK_CHANNEL are set, mirroring the Drive layer:
 * without them isSlackEnabled() is false and nothing is sent.
 */
import type { DriveFileResult } from "@/lib/drive";

export function isSlackEnabled(): boolean {
  return Boolean(process.env.SLACK_TOKEN && process.env.SLACK_CHANNEL);
}

export interface FilingNotification {
  uploaded: number;
  skipped: number;
  failed: number;
  results: DriveFileResult[];
  /** What was filed, e.g. "TikTok ads invoices" or "Amazon fee invoices".
   *  Keeps this notifier project-agnostic. Defaults to a generic label. */
  label?: string;
  /** Statement/invoice period, if known (e.g. "juni-26"), purely for context. */
  period?: string;
}

/** Cap the per-file list so a large batch doesn't post a wall of text. */
const MAX_LISTED = 15;

/** Escape the three characters Slack treats specially in mrkdwn text. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fileLine(r: DriveFileResult): string {
  const name = esc(r.proposedName || r.fileName);
  const label = r.webViewLink ? `<${r.webViewLink}|${name}>` : name;
  if (r.outcome === "uploaded") return `• ${label}`;
  if (r.outcome === "skipped-duplicate") return `• ${label} _(already there)_`;
  return `• ${name} _(failed: ${esc(r.error ?? "unknown")})_`;
}

/**
 * Post the filing summary to the configured channel. Returns true when Slack
 * accepted the message, false when disabled or the call failed (the caller
 * treats notification as best-effort and never blocks filing on it).
 */
export async function postFilingNotification(n: FilingNotification): Promise<boolean> {
  if (!isSlackEnabled()) return false;

  const periodSuffix = n.period ? ` (${n.period})` : "";
  const headline = `${n.label ?? "Invoices"} filed to Drive${periodSuffix}`;
  const summary = [
    `*${n.uploaded}* filed`,
    n.skipped > 0 ? `${n.skipped} already there` : "",
    n.failed > 0 ? `*${n.failed} failed*` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");

  const listed = n.results.slice(0, MAX_LISTED).map(fileLine);
  const overflow = n.results.length - listed.length;
  const body = [summary, "", ...listed, overflow > 0 ? `…and ${overflow} more` : ""]
    .filter((line) => line !== undefined)
    .join("\n");

  const text = `${headline}\n${summary}`; // plain fallback for notifications

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SLACK_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: process.env.SLACK_CHANNEL,
        text,
        blocks: [
          { type: "header", text: { type: "plain_text", text: headline, emoji: true } },
          { type: "section", text: { type: "mrkdwn", text: body } },
        ],
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

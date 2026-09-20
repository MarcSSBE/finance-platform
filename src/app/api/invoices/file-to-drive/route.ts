import { NextResponse } from "next/server";
import { parseInvoice } from "@/lib/invoices/parse";
import {
  fileToDrive,
  getDriveClient,
  isDriveEnabled,
  type DriveFileResult,
} from "@/lib/drive";
import { isSlackEnabled, postFilingNotification } from "@/lib/notify/slack";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby max

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  if (!isDriveEnabled()) {
    return NextResponse.json(
      { error: "Google Drive is not configured on the server." },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const invoiceFiles = form.getAll("invoices").filter((f): f is File => f instanceof File);
    if (invoiceFiles.length === 0) {
      return NextResponse.json({ error: "No invoices to file." }, { status: 400 });
    }

    const { drive, rootId } = getDriveClient();
    const results: DriveFileResult[] = [];

    // Sequential: keeps folder find-or-create race-free when many invoices share a month.
    for (const file of invoiceFiles) {
      if (file.size > MAX_FILE_BYTES) continue;
      const bytes = Buffer.from(await file.arrayBuffer());
      const invoice = await parseInvoice(bytes, file.name);
      if (invoice.error) {
        results.push({
          fileName: file.name,
          proposedName: "",
          drivePath: "",
          outcome: "error",
          error: invoice.error,
        });
        continue;
      }
      results.push(await fileToDrive(drive, rootId, invoice, bytes));
    }

    const uploaded = results.filter((r) => r.outcome === "uploaded").length;
    const skipped = results.filter((r) => r.outcome === "skipped-duplicate").length;
    const failed = results.filter((r) => r.outcome === "error").length;

    // Notify Slack only when the run actually changed something (an upload) or
    // hit an error — a re-run that's all duplicates is silent. Best-effort:
    // filing already succeeded, so a Slack failure never fails the request.
    let notified = false;
    if (isSlackEnabled() && (uploaded > 0 || failed > 0)) {
      // Month label for context, e.g. "06. Jun 2026" from "Accounting/06. Jun 2026/Tiktok".
      const period = results.find((r) => r.drivePath)?.drivePath.split("/")[1];
      notified = await postFilingNotification({
        label: "TikTok ads invoices",
        uploaded,
        skipped,
        failed,
        results,
        period,
      });
    }

    return NextResponse.json({ uploaded, skipped, failed, results, notified });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Filing failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

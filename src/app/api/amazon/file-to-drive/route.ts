import { NextResponse } from "next/server";
import { expandToPdfs } from "@/lib/amazon/intake";
import { parseAmazonInvoice } from "@/lib/amazon/parse";
import { withCollisionSuffix } from "@/lib/amazon/naming";
import { fileToDrive, getDriveClient, isDriveEnabled, type DriveFileResult } from "@/lib/drive";
import { isSlackEnabled, postFilingNotification } from "@/lib/notify/slack";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * File a batch of Amazon fee invoices into Google Drive
 * (`Accounting / NN. Mon YYYY / Amazon`), skipping duplicates, then post a Slack
 * summary. Reuses the shared Drive + Slack infra so this stays thin.
 */
export async function POST(req: Request) {
  if (!isDriveEnabled()) {
    return NextResponse.json(
      { error: "Google Drive is not configured on the server." },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files to file." }, { status: 400 });
    }

    const pdfs = await expandToPdfs(files, MAX_FILE_BYTES);
    if (pdfs.length === 0) {
      return NextResponse.json({ error: "No PDF invoices were found." }, { status: 400 });
    }

    const { drive, rootId } = getDriveClient();
    const results: DriveFileResult[] = [];
    // Guard against two invoices in one batch resolving to the same filename.
    const usedByPath = new Set<string>();

    // Sequential keeps find-or-create of the month/Amazon folder race-free.
    for (const pdf of pdfs) {
      const invoice = await parseAmazonInvoice(pdf.bytes, pdf.name);
      if (invoice.error) {
        results.push({
          fileName: pdf.name,
          proposedName: "",
          drivePath: "",
          outcome: "error",
          error: invoice.error,
        });
        continue;
      }

      let name = invoice.proposedName;
      let n = 2;
      while (usedByPath.has(`${invoice.drivePath}/${name}`)) {
        name = withCollisionSuffix(invoice.proposedName, n++);
      }
      usedByPath.add(`${invoice.drivePath}/${name}`);

      results.push(
        await fileToDrive(
          drive,
          rootId,
          { fileName: invoice.fileName, proposedName: name, drivePath: invoice.drivePath },
          pdf.bytes,
        ),
      );
    }

    const uploaded = results.filter((r) => r.outcome === "uploaded").length;
    const skipped = results.filter((r) => r.outcome === "skipped-duplicate").length;
    const failed = results.filter((r) => r.outcome === "error").length;

    let notified = false;
    if (isSlackEnabled() && (uploaded > 0 || failed > 0)) {
      const period = results.find((r) => r.drivePath)?.drivePath.split("/")[1];
      notified = await postFilingNotification({
        label: "Amazon fee invoices",
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

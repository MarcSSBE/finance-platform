import { NextResponse } from "next/server";
import { expandToPdfs } from "@/lib/amazon/intake";
import { parseAmazonInvoice } from "@/lib/amazon/parse";
import { withCollisionSuffix } from "@/lib/amazon/naming";
import {
  fileToDriveBatch,
  getDriveClient,
  isDriveEnabled,
  type DriveBatchItem,
  type DriveFileResult,
} from "@/lib/drive";
import { isSlackEnabled, postFilingNotification } from "@/lib/notify/slack";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby max

const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * File a batch of Amazon fee invoices into Google Drive
 * (`Accounting / NN. Mon YYYY / Amazon / <CC>`), skipping duplicates, then post a
 * Slack summary. Reuses the shared Drive + Slack infra so this stays thin.
 *
 * The whole batch is parsed and named FIRST (fast, in memory), then filed via
 * the shared batch filer, which memoizes folders and uploads with bounded
 * concurrency. That keeps dozens of invoices well inside the 60s function limit;
 * the previous file-at-a-time loop re-resolved every folder per file and timed
 * out on large batches, so only the first few ever landed.
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
    const received = pdfs.length;

    // 1) Parse every PDF (cheap: ~25ms each, no network).
    const parsed = await Promise.all(pdfs.map((p) => parseAmazonInvoice(p.bytes, p.name)));

    // 2) Files that could not be parsed are reported as errors, never silently
    //    dropped — a partial run must never look like a complete one.
    const parseErrors: DriveFileResult[] = [];
    const toFile: DriveBatchItem[] = [];
    const usedByPath = new Set<string>();

    parsed.forEach((invoice, i) => {
      if (invoice.error) {
        parseErrors.push({
          fileName: pdfs[i].name,
          proposedName: "",
          drivePath: "",
          outcome: "error",
          error: invoice.error,
        });
        return;
      }
      // Disambiguate two distinct invoices in this batch that resolve to the same
      // name (same country+type+currency+total) so neither is lost to the other.
      let name = invoice.proposedName;
      let n = 2;
      while (usedByPath.has(`${invoice.drivePath}/${name}`)) {
        name = withCollisionSuffix(invoice.proposedName, n++);
      }
      usedByPath.add(`${invoice.drivePath}/${name}`);
      toFile.push({
        item: { fileName: invoice.fileName, proposedName: name, drivePath: invoice.drivePath },
        bytes: pdfs[i].bytes,
      });
    });

    // 3) File the readable ones with memoized folders + bounded concurrency.
    const { drive, rootId } = getDriveClient();
    const filed = await fileToDriveBatch(drive, rootId, toFile);

    const results = [...filed, ...parseErrors];
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

    return NextResponse.json({ received, uploaded, skipped, failed, results, notified });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Filing failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

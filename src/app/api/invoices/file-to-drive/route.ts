import { NextResponse } from "next/server";
import { parseInvoice } from "@/lib/invoices/parse";
import {
  fileInvoiceToDrive,
  getDriveClient,
  isDriveEnabled,
  type DriveFileResult,
} from "@/lib/invoices/drive";

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
      results.push(await fileInvoiceToDrive(drive, rootId, invoice, bytes));
    }

    const uploaded = results.filter((r) => r.outcome === "uploaded").length;
    const skipped = results.filter((r) => r.outcome === "skipped-duplicate").length;
    const failed = results.filter((r) => r.outcome === "error").length;
    return NextResponse.json({ uploaded, skipped, failed, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Filing failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

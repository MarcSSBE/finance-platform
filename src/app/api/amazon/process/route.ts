import { NextResponse } from "next/server";
import { expandToPdfs } from "@/lib/amazon/intake";
import { parseAmazonInvoice } from "@/lib/amazon/parse";
import { isDriveEnabled } from "@/lib/drive";
import type { AmazonBatchResult, AmazonInvoice } from "@/lib/amazon/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PDFS = 400;

/**
 * Parse an uploaded batch of Amazon fee invoices (loose PDFs and/or the Seller
 * Central ZIP) into a deterministic summary: each invoice's fields + proposed
 * filing name/path, per-currency totals, and anything unreadable. No Drive
 * writes here (dry run) — filing is a separate, explicit step.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });
    }

    const pdfs = await expandToPdfs(files, MAX_FILE_BYTES);
    if (pdfs.length === 0) {
      return NextResponse.json(
        { error: "No PDF invoices were found (upload the Tax Document Library ZIP or the PDFs)." },
        { status: 400 },
      );
    }
    if (pdfs.length > MAX_PDFS) {
      return NextResponse.json({ error: "Too many invoices in one batch." }, { status: 400 });
    }

    const parsed = await Promise.all(pdfs.map((p) => parseAmazonInvoice(p.bytes, p.name)));
    const invoices = parsed.filter((p) => !p.error);
    const unreadable = parsed.filter((p) => p.error);

    // Deterministic per-currency totals across the readable invoices.
    const totalsMap = new Map<string, { totalCents: number; count: number }>();
    for (const inv of invoices) {
      const b = totalsMap.get(inv.currency) ?? { totalCents: 0, count: 0 };
      b.totalCents += inv.totalCents;
      b.count += 1;
      totalsMap.set(inv.currency, b);
    }
    const totalsByCurrency = [...totalsMap.entries()]
      .map(([currency, v]) => ({ currency, totalCents: v.totalCents, count: v.count }))
      .sort((a, b) => b.count - a.count);

    const batch: AmazonBatchResult = { invoices, unreadable, totalsByCurrency };
    return NextResponse.json({ batch, driveEnabled: isDriveEnabled() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not read those files.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

// Re-exported for tests/other routes that want the same shape.
export type { AmazonBatchResult, AmazonInvoice };

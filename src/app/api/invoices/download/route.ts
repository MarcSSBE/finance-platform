import { NextResponse } from "next/server";
import JSZip from "jszip";
import { parseInvoice } from "@/lib/invoices/parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Re-parse the uploaded invoices and return a .zip whose folders mirror the
 * Drive layout (`Accounting/06. Jun 2026/Tiktok/…`) with each file renamed to
 * the convention. This is the local stand-in for filing straight to Drive.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const invoiceFiles = form.getAll("invoices").filter((f): f is File => f instanceof File);
    if (invoiceFiles.length === 0) {
      return NextResponse.json({ error: "No invoices to file." }, { status: 400 });
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();

    for (const file of invoiceFiles) {
      if (file.size > MAX_FILE_BYTES) continue;
      const bytes = Buffer.from(await file.arrayBuffer());
      const parsed = await parseInvoice(bytes, file.name);

      if (parsed.error) {
        zip.folder("_unreadable")!.file(file.name, bytes);
        continue;
      }

      // Avoid collisions (two invoices, same amount + date) by suffixing.
      let name = parsed.proposedName;
      let path = `${parsed.drivePath}/${name}`;
      let n = 2;
      while (usedNames.has(path)) {
        name = parsed.proposedName.replace(/\.pdf$/i, ` (${n}).pdf`);
        path = `${parsed.drivePath}/${name}`;
        n++;
      }
      usedNames.add(path);
      zip.file(path, bytes);
    }

    const out = await zip.generateAsync({ type: "nodebuffer" });
    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="tiktok-invoices-renamed.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not build the download.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

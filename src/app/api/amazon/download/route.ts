import { NextResponse } from "next/server";
import JSZip from "jszip";
import { expandToPdfs } from "@/lib/amazon/intake";
import { parseAmazonInvoice } from "@/lib/amazon/parse";
import { withCollisionSuffix } from "@/lib/amazon/naming";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Re-parse the uploaded invoices and return a .zip whose folders mirror the
 * Drive layout (`Accounting/07. Jul 2026/Amazon/…`), each file renamed to the
 * convention. Local stand-in / fallback when Drive filing is not configured.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files to package." }, { status: 400 });
    }

    const pdfs = await expandToPdfs(files, MAX_FILE_BYTES);
    const zip = new JSZip();
    const usedPaths = new Set<string>();

    for (const pdf of pdfs) {
      const parsed = await parseAmazonInvoice(pdf.bytes, pdf.name);
      if (parsed.error) {
        zip.folder("_unreadable")!.file(pdf.name, pdf.bytes);
        continue;
      }
      let name = parsed.proposedName;
      let path = `${parsed.drivePath}/${name}`;
      let n = 2;
      while (usedPaths.has(path)) {
        name = withCollisionSuffix(parsed.proposedName, n++);
        path = `${parsed.drivePath}/${name}`;
      }
      usedPaths.add(path);
      zip.file(path, pdf.bytes);
    }

    const out = await zip.generateAsync({ type: "nodebuffer" });
    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="amazon-invoices-renamed.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not build the download.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

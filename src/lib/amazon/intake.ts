/**
 * Upload intake for Project 3. Veronica downloads the Seller Central "Tax
 * Document Library" export, which is a ZIP of invoice PDFs, but she may also
 * drop loose PDFs. This expands whatever was uploaded into a flat list of PDFs
 * so the rest of the pipeline only ever deals with individual invoices.
 */
import JSZip from "jszip";

export interface RawPdf {
  name: string;
  bytes: Buffer;
}

/**
 * Turn uploaded files (loose PDFs and/or ZIPs) into a flat list of PDFs.
 * Non-PDF, oversized, or unreadable entries are skipped.
 */
export async function expandToPdfs(files: File[], maxBytes: number): Promise<RawPdf[]> {
  const out: RawPdf[] = [];
  for (const f of files) {
    if (f.size > maxBytes) continue;
    const buf = Buffer.from(await f.arrayBuffer());

    if (/\.zip$/i.test(f.name)) {
      try {
        const zip = await JSZip.loadAsync(buf);
        for (const entry of Object.values(zip.files)) {
          if (entry.dir || !/\.pdf$/i.test(entry.name)) continue;
          const bytes = Buffer.from(await entry.async("nodebuffer"));
          out.push({ name: entry.name.split("/").pop() || entry.name, bytes });
        }
      } catch {
        // A corrupt ZIP is skipped rather than failing the whole batch.
      }
    } else if (/\.pdf$/i.test(f.name)) {
      out.push({ name: f.name, bytes: buf });
    }
  }
  return out;
}

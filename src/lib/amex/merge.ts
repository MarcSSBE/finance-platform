/**
 * One PDF of all receipts (Veronica, 2026-11-09): Fortnox takes the supporting
 * documents of a voucher one file at a time, unless they are combined into a
 * single PDF. Her Amex folder is private (only she and Christoffer may open
 * it), so this runs in her browser: she picks the Drive download ZIP (or the
 * files), nothing is uploaded.
 *
 * Deterministic, no AI. Receipts are ordered by the date in her file names
 * (vendor, then name, when the date is the same; names without a readable date
 * last), PDFs are copied page for page, images become one page each. A file
 * that cannot be added (password-protected or broken PDF, other file type) is
 * never dropped silently: it is returned in `skipped` with the reason and listed
 * on the contents page.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { parseReceiptName } from "./naming";

export interface MergeInput {
  name: string;
  bytes: Uint8Array;
}

export interface MergeResult {
  pdf: Uint8Array;
  /** In the order they appear, with the page each starts on (1-based, contents page included). */
  added: { name: string; firstPage: number; pages: number }[];
  skipped: { name: string; reason: "encrypted" | "unreadable" | "empty" | "type" }[];
  totalPages: number;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const LINES_PER_PAGE = 48;

/**
 * Pure: receipts in date order (year, month, day; a name with only a month, "aug-26", comes first in its
 * month), then vendor, then file name; names without a readable date last.
 */
export function orderReceipts<T extends { name: string }>(files: T[]): T[] {
  const key = (f: T) => {
    const p = parseReceiptName(f.name);
    return p ? [0, p.year, p.month, p.day ?? 0, p.vendor.toLowerCase()] : [1, 0, 0, 0, ""];
  };
  return [...files].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Text the standard font can draw (WinAnsi); anything else becomes "?". */
function safe(font: PDFFont, s: string): string {
  return [...s]
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return "?";
      }
    })
    .join("");
}

const baseName = (path: string) => path.split("/").pop() ?? path;

export async function mergeReceipts(
  files: MergeInput[],
  opts: { contentsPage?: boolean; title?: string; createdISO?: string } = {},
): Promise<MergeResult> {
  const contents = opts.contentsPage ?? true;
  const out = await PDFDocument.create();
  const added: { name: string; firstPage: number; pages: number }[] = [];
  const skipped: MergeResult["skipped"] = [];

  for (const f of orderReceipts(files)) {
    const name = baseName(f.name);
    const ext = name.toLowerCase().split(".").pop() ?? "";
    const before = out.getPageCount();
    try {
      if (ext === "pdf") {
        let src: PDFDocument;
        try {
          src = await PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false });
        } catch {
          skipped.push({ name, reason: "unreadable" });
          continue;
        }
        // Pages of an encrypted PDF copy as blanks: refuse rather than attach empty pages.
        if (src.isEncrypted) {
          skipped.push({ name, reason: "encrypted" });
          continue;
        }
        if (src.getPageCount() === 0) {
          skipped.push({ name, reason: "empty" });
          continue;
        }
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      } else if (ext === "png" || ext === "jpg" || ext === "jpeg") {
        const img = ext === "png" ? await out.embedPng(f.bytes) : await out.embedJpg(f.bytes);
        // Fit inside A4 with a margin, never enlarged.
        const scale = Math.min(1, (A4[0] - 2 * MARGIN) / img.width, (A4[1] - 2 * MARGIN) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const page = out.addPage(A4);
        page.drawImage(img, { x: (A4[0] - w) / 2, y: A4[1] - MARGIN - h, width: w, height: h });
      } else {
        skipped.push({ name, reason: "type" });
        continue;
      }
    } catch {
      // Roll back anything half-added for this file.
      while (out.getPageCount() > before) out.removePage(out.getPageCount() - 1);
      skipped.push({ name, reason: "unreadable" });
      continue;
    }
    added.push({ name, firstPage: before + 1, pages: out.getPageCount() - before });
  }

  if (contents && (added.length || skipped.length)) {
    const reasons: Record<MergeResult["skipped"][number]["reason"], string> = {
      encrypted: "password-protected PDF",
      unreadable: "could not be read",
      empty: "PDF has no pages",
      type: "not a PDF or image",
    };
    const lines: string[] = [
      opts.title ?? "Receipts",
      `${added.length} file(s) in this PDF${opts.createdISO ? `, made ${opts.createdISO}` : ""}.`,
      "",
      ...added.map((a) => `p. ${a.firstPage}    ${a.name}`),
      ...(skipped.length ? ["", "NOT included (add these by hand):", ...skipped.map((s) => `- ${s.name} (${reasons[s.reason]})`)] : []),
    ];
    const nIndex = Math.ceil(lines.length / LINES_PER_PAGE);
    // Page numbers move down by the contents pages.
    for (const a of added) a.firstPage += nIndex;
    const shifted = lines.map((l) => l.replace(/^p\. (\d+)/, (_, n: string) => `p. ${Number(n) + nIndex}`));
    const font = await out.embedFont(StandardFonts.Helvetica);
    const bold = await out.embedFont(StandardFonts.HelveticaBold);
    for (let i = nIndex - 1; i >= 0; i--) {
      const page = out.insertPage(0, A4);
      shifted.slice(i * LINES_PER_PAGE, (i + 1) * LINES_PER_PAGE).forEach((l, k) => {
        const isTitle = i === 0 && k === 0;
        const f = isTitle ? bold : font;
        page.drawText(safe(f, l).slice(0, 110), {
          x: MARGIN,
          y: A4[1] - MARGIN - 14 - k * 15.5,
          size: isTitle ? 13 : 9.5,
          font: f,
          color: rgb(0.1, 0.1, 0.1),
        });
      });
    }
  }

  const pdf = await out.save();
  return { pdf, added, skipped, totalPages: out.getPageCount() };
}

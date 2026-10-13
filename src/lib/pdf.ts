import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extract the text layer from a PDF buffer. Project-agnostic shared infra used
 * by every feature that reads PDFs (TikTok invoices, Amazon fee invoices, ...).
 *
 * Uses `unpdf` (a serverless-optimized pdfjs build) so it runs on Vercel's Node
 * runtime without the browser globals (DOMMatrix, canvas) that plain pdfjs needs.
 */
export async function extractPdfText(buffer: ArrayBuffer | Buffer): Promise<string> {
  const bytes =
    buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer as ArrayBuffer);
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** One text run on a PDF page, with its position in PDF points (origin bottom-left). */
export interface PdfTextItem {
  page: number; // 1-based
  x: number;
  y: number;
  str: string;
}

/**
 * Extract every non-empty text run with its page coordinates. For column/table
 * layouts (e.g. the Amex statement) where the flat text layer separates a row's
 * description from its amount, so rows must be rebuilt by position.
 */
export async function extractPdfItems(buffer: ArrayBuffer | Buffer): Promise<PdfTextItem[]> {
  const bytes =
    buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer as ArrayBuffer);
  const pdf = await getDocumentProxy(bytes);
  const items: PdfTextItem[] = [];
  for (let page = 1; page <= pdf.numPages; page++) {
    const content = await (await pdf.getPage(page)).getTextContent();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      items.push({ page, x: it.transform[4], y: it.transform[5], str: it.str.trim() });
    }
  }
  return items;
}

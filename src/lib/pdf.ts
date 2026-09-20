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

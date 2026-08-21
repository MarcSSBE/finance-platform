import { PDFParse } from "pdf-parse";

/** Extract the text layer from a PDF buffer. */
export async function extractPdfText(buffer: ArrayBuffer | Buffer): Promise<string> {
  const bytes =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy?.();
  }
}

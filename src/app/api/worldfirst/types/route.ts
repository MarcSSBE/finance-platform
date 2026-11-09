import { NextResponse } from "next/server";
import { isWorldFirstPdfText, parseWorldFirstPdf, parseWorldFirstStatement } from "@/lib/amex/worldfirst";
import { breakdownByType } from "@/lib/worldfirst/by-type";
import { extractPdfText } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * WorldFirst totals by type: one statement (the multi-currency or a currency
 * account PDF, or the .xlsx export) grouped by type with money out and in per
 * currency. Read-only, all totals computed in code.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const isExcel = /\.xlsx$/i.test(file.name);
    if (!isExcel && !/\.pdf$/i.test(file.name)) {
      return NextResponse.json({ error: "Please upload the WorldFirst statement (.pdf) or export (.xlsx)." }, { status: 400 });
    }
    if (!isExcel && !isWorldFirstPdfText(await extractPdfText(bytes))) {
      return NextResponse.json({ error: `${file.name} is not a WorldFirst statement.` }, { status: 422 });
    }
    const statement = isExcel ? await parseWorldFirstStatement(bytes, file.name) : await parseWorldFirstPdf(bytes);
    if (statement.lines.length === 0) {
      return NextResponse.json({ error: `No transactions were found in ${file.name}.` }, { status: 422 });
    }
    return NextResponse.json({ breakdown: breakdownByType(statement), fromPdf: !isExcel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not read that statement.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

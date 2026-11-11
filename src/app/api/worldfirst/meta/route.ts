import { NextResponse } from "next/server";
import { parseWorldFirstStatement } from "@/lib/amex/worldfirst";
import { isMetaBillingText, parseMetaBilling, reconcileMeta } from "@/lib/worldfirst/meta-billing";
import { extractPdfText } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Facebook ads: the WorldFirst StatementDetail export (.xlsx) vs Meta's billing
 * report (.pdf). Read-only, every amount read and compared in code.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const meta = form.get("meta");
    if (!(file instanceof File) || !(meta instanceof File)) {
      return NextResponse.json({ error: "Upload the WorldFirst export and Meta's billing report." }, { status: 400 });
    }
    if (file.size > MAX_BYTES || meta.size > MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large." }, { status: 400 });
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return NextResponse.json({ error: "Please use the WorldFirst .xlsx export." }, { status: 400 });
    }
    if (!/\.pdf$/i.test(meta.name)) {
      return NextResponse.json({ error: "Please upload Meta's billing report as a PDF." }, { status: 400 });
    }
    const metaBytes = Buffer.from(await meta.arrayBuffer());
    if (!isMetaBillingText(await extractPdfText(metaBytes))) {
      return NextResponse.json({ error: `${meta.name} is not a Meta billing report.` }, { status: 422 });
    }
    const statement = await parseWorldFirstStatement(Buffer.from(await file.arrayBuffer()), file.name);
    const report = await parseMetaBilling(metaBytes);
    const reconciliation = reconcileMeta(statement, report);
    return NextResponse.json({
      report: { ...report, lines: undefined, lineCount: report.lines.length },
      reconciliation,
      statementChecked: Boolean(statement.balanceChecked && statement.totalsMatch),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not read those files.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

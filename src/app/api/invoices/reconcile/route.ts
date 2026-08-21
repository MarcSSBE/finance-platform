import { NextResponse } from "next/server";
import { parseInvoice, parseStatement } from "@/lib/invoices/parse";
import { reconcile } from "@/lib/invoices/reconcile";
import { isDriveEnabled } from "@/lib/invoices/drive";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_INVOICES = 200;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const statementFile = form.get("statement");
    const invoiceFiles = form.getAll("invoices").filter((f): f is File => f instanceof File);

    if (!(statementFile instanceof File)) {
      return NextResponse.json(
        { error: "Please upload the WorldFirst statement PDF." },
        { status: 400 },
      );
    }
    if (invoiceFiles.length === 0) {
      return NextResponse.json(
        { error: "Please upload at least one invoice PDF." },
        { status: 400 },
      );
    }
    if (invoiceFiles.length > MAX_INVOICES) {
      return NextResponse.json({ error: "Too many invoices at once." }, { status: 400 });
    }
    for (const f of [statementFile, ...invoiceFiles]) {
      if (f.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `"${f.name}" is too large.` }, { status: 400 });
      }
    }

    const statement = await parseStatement(Buffer.from(await statementFile.arrayBuffer()));
    const invoices = await Promise.all(
      invoiceFiles.map(async (f) => parseInvoice(Buffer.from(await f.arrayBuffer()), f.name)),
    );
    const reconciliation = reconcile(statement.payments, invoices);

    return NextResponse.json({
      period: statement.period,
      invoices,
      reconciliation,
      driveEnabled: isDriveEnabled(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not reconcile those files.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

import { NextResponse } from "next/server";
import { parseAmexStatement } from "@/lib/amex/parse";
import { parseReceiptName } from "@/lib/amex/naming";
import { reconcileAmex } from "@/lib/amex/reconcile";
import { parseWorldFirstStatement } from "@/lib/amex/worldfirst";
import type { AmexReceipt } from "@/lib/amex/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;
const MAX_RECEIPTS = 2000;

/**
 * Check a statement against the receipts Veronica has: the Amex statement PDF
 * or a WorldFirst account export (.xlsx). The statement is parsed in code;
 * receipts are known only by their file names (her naming
 * convention carries vendor, amount and month), so the browser sends names,
 * never the receipt files. Read-only: nothing is filed or moved.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const statementFile = form.get("statement");
    if (!(statementFile instanceof File)) {
      return NextResponse.json({ error: "Add the Amex statement PDF or the WorldFirst export." }, { status: 400 });
    }
    if (statementFile.size > MAX_STATEMENT_BYTES) {
      return NextResponse.json({ error: "The statement file is too large." }, { status: 400 });
    }

    let names: unknown = [];
    try {
      names = JSON.parse(String(form.get("receiptNames") ?? "[]"));
    } catch {
      return NextResponse.json({ error: "The receipt list could not be read." }, { status: 400 });
    }
    if (!Array.isArray(names) || names.length > MAX_RECEIPTS || names.some((n) => typeof n !== "string")) {
      return NextResponse.json({ error: "The receipt list could not be read." }, { status: 400 });
    }

    const bytes = Buffer.from(await statementFile.arrayBuffer());
    const isExcel = /\.xlsx$/i.test(statementFile.name);
    const statement = isExcel
      ? await parseWorldFirstStatement(bytes, statementFile.name)
      : await parseAmexStatement(bytes);
    if (statement.lines.length === 0) {
      return NextResponse.json(
        {
          error: isExcel
            ? "No transactions were found. Is this the WorldFirst statement export?"
            : "No transactions were found. Is this the Amex statement PDF?",
        },
        { status: 422 },
      );
    }

    const receipts: AmexReceipt[] = [];
    const unreadable: string[] = [];
    for (const name of names as string[]) {
      const parsed = parseReceiptName(name);
      if (parsed) receipts.push(parsed);
      else unreadable.push(name);
    }

    const reconciliation = reconcileAmex(statement, receipts, unreadable);
    return NextResponse.json({ statement, reconciliation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not read that statement.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

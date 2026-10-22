import { NextResponse } from "next/server";
import { combineStatements } from "@/lib/amex/combine";
import { parseAmexStatement } from "@/lib/amex/parse";
import { parseReceiptName } from "@/lib/amex/naming";
import { reconcileAmex } from "@/lib/amex/reconcile";
import { isWorldFirstPdfText, parseWorldFirstPdf, parseWorldFirstStatement } from "@/lib/amex/worldfirst";
import { extractPdfText } from "@/lib/pdf";
import type { AmexReceipt, AmexStatement } from "@/lib/amex/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;
const MAX_RECEIPTS = 2000;
// Amex + WorldFirst, whose statement PDFs come one per currency account.
const MAX_STATEMENTS = 8;

/**
 * Check statements against the receipts Veronica has: the Amex statement PDF
 * and/or WorldFirst (the account export .xlsx, or its statement PDFs, one per
 * currency account). Several statements are checked
 * together (she files a receipt under either card), so a receipt is "no
 * charge" only when no statement has it. Statements are parsed in code;
 * receipts are known only by their file names (her naming
 * convention carries vendor, amount and month), so the browser sends names,
 * never the receipt files. Read-only: nothing is filed or moved.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const statementFiles = form.getAll("statement").filter((f): f is File => f instanceof File);
    if (statementFiles.length === 0) {
      return NextResponse.json({ error: "Add the Amex statement PDF or the WorldFirst export." }, { status: 400 });
    }
    if (statementFiles.length > MAX_STATEMENTS) {
      return NextResponse.json({ error: `Check at most ${MAX_STATEMENTS} statements at once.` }, { status: 400 });
    }
    if (statementFiles.some((f) => f.size > MAX_STATEMENT_BYTES)) {
      return NextResponse.json({ error: "A statement file is too large." }, { status: 400 });
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

    const statements: AmexStatement[] = [];
    for (const file of statementFiles) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const isExcel = /\.xlsx$/i.test(file.name);
      const isWfPdf = !isExcel && isWorldFirstPdfText(await extractPdfText(bytes));
      const parsed = isExcel
        ? await parseWorldFirstStatement(bytes, file.name)
        : isWfPdf
          ? await parseWorldFirstPdf(bytes)
          : await parseAmexStatement(bytes);
      if (parsed.lines.length === 0) {
        return NextResponse.json(
          {
            error: isExcel
              ? `No transactions were found in ${file.name}. Is this the WorldFirst statement export?`
              : isWfPdf
                ? `No transactions were found in ${file.name}.`
              : `No transactions were found in ${file.name}. Is this the Amex statement PDF?`,
          },
          { status: 422 },
        );
      }
      statements.push(parsed);
    }
    const statement = combineStatements(statements);

    const receipts: AmexReceipt[] = [];
    const unreadable: string[] = [];
    for (const name of names as string[]) {
      const parsed = parseReceiptName(name);
      if (parsed) receipts.push(parsed);
      else unreadable.push(name);
    }

    const reconciliation = reconcileAmex(statement, receipts, unreadable);
    return NextResponse.json({ statement, statements, reconciliation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not read that statement.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

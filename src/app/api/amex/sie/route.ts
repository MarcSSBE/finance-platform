import { NextResponse } from "next/server";
import { parseAmexStatement } from "@/lib/amex/parse";
import { buildVoucher, defaultVoucherDate, sieText, toCp437 } from "@/lib/amex/sie";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;
const COMPANY = { orgNr: "559055-1502", name: "Burman Enterprise AB" };

/**
 * Fortnox SIE file (one voucher) from ONE Amex statement PDF (Veronica 2026-11-10). Read-only: the file is returned
 * to her browser, nothing is sent to Fortnox. Refuses a statement whose lines do not add up to its printed total.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("statement");
    if (!(file instanceof File)) return NextResponse.json({ error: "Add the Amex statement PDF." }, { status: 400 });
    if (file.size > MAX_STATEMENT_BYTES) return NextResponse.json({ error: "The statement file is too large." }, { status: 400 });
    if (!/\.pdf$/i.test(file.name)) return NextResponse.json({ error: "Use the Amex statement PDF." }, { status: 400 });

    const st = await parseAmexStatement(Buffer.from(await file.arrayBuffer()));
    if (st.lines.length === 0)
      return NextResponse.json({ error: `No transactions were found in ${file.name}. Is this the Amex statement PDF?` }, { status: 422 });
    if (!st.totalsMatch)
      return NextResponse.json(
        { error: "The lines read from this statement do not add up to its printed total, so no file was made. Please book it by hand." },
        { status: 422 },
      );

    const asked = String(form.get("date") ?? "");
    const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : defaultVoucherDate(st.statementDateISO);
    const v = buildVoucher(st, { dateISO });
    if (v.trans.reduce((n, t) => n + t.ore, 0) !== 0) throw new Error("The voucher does not balance.");
    const text = sieText(v, COMPANY, new Date().toISOString().slice(0, 10));
    return NextResponse.json({
      statement: { dateISO: st.statementDateISO, periodStartISO: st.periodStartISO, periodEndISO: st.periodEndISO },
      voucher: { series: v.series, dateISO: v.dateISO, text: v.text, trans: v.trans, bookedOre: v.bookedOre, forYouOre: v.forYouOre },
      decisions: v.decisions.map((d) => ({
        dateISO: d.line.dateISO,
        description: d.line.description,
        sekOre: d.line.sekCents,
        status: d.status,
        account: d.account ?? "",
        reason: d.reason,
      })),
      fileName: `Amex ${st.periodStartISO} - ${st.periodEndISO}.si`, // SIE 4I = import file (.si)
      sieBase64: v.trans.length ? Buffer.from(toCp437(text)).toString("base64") : "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not read that statement.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

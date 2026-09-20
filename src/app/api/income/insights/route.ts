import { NextResponse } from "next/server";
import { parseIncomeWorkbook } from "@/lib/income/parse";
import { computeInsights } from "@/lib/income/insights";
import { summarizeIncome, type NarrativeLang } from "@/lib/income/narrative";
import { isAiEnabled } from "@/lib/ai/claude";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const lang: NarrativeLang = form.get("lang") === "sv" ? "sv" : "en";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large." }, { status: 400 });
    }

    // Re-parse deterministically so the stats are authoritative server-side,
    // never trusting numbers sent from the client.
    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await parseIncomeWorkbook(buffer, { fileName: file.name });
    const insights = computeInsights(summary);

    // The narrative is the ONLY AI touchpoint here, and it is figure-free +
    // re-validated. Null when AI is off or the guard rejected the text.
    const narrative = await summarizeIncome(insights, lang);

    return NextResponse.json({
      anomalies: insights.anomalies,
      stats: insights.stats,
      narrative,
      aiEnabled: isAiEnabled(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "We could not analyze that file.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

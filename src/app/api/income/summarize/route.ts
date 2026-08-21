import { NextResponse } from "next/server";
import { parseIncomeWorkbook } from "@/lib/income/parse";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — WorldFirst exports are tiny.

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return NextResponse.json(
        { error: "Please upload the WorldFirst .xlsx export." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await parseIncomeWorkbook(buffer, { fileName: file.name });
    return NextResponse.json({ summary });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "We could not read that file.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

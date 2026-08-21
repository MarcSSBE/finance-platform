import { NextResponse } from "next/server";
import { buildIncomeExport } from "@/lib/income/export";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

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
    const { buffer: out, outName } = await buildIncomeExport(buffer, file.name);

    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(outName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "We could not build that file.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

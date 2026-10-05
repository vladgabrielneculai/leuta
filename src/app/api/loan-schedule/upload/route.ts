import { NextRequest, NextResponse } from "next/server";
import { errorResponse, MAX_UPLOAD_BYTES } from "@/lib/http";
import { parsePdf, parseSpreadsheet, type ParsedScheduleRow, type ScheduleMeta } from "@/lib/scheduleParser";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const loanId = Number(formData.get("loanId"));

    if (!file) {
      return NextResponse.json({ error: "Nu a fost selectat niciun fișier." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Fișierul este prea mare (maxim 10 MB)." }, { status: 413 });
    }
    const filename = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rows: ParsedScheduleRow[] = [];
    let meta: ScheduleMeta | null = null;

    if (filename.endsWith(".xlsx") || filename.endsWith(".xls") || filename.endsWith(".csv")) {
      rows = await parseSpreadsheet(buffer, filename);
    } else if (filename.endsWith(".pdf")) {
      ({ rows, meta } = await parsePdf(buffer));
    } else {
      return NextResponse.json({ error: "Format nesuportat. Încarcă un fișier PDF, Excel (.xlsx) sau CSV." }, { status: 400 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        error: "Nu s-au putut extrage rate valide din acest fișier. Asigură-te că fișierul conține un tabel de scadențar cu rate, date și solduri.",
      }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      filename: file.name,
      loanId,
      count: rows.length,
      preview: rows.slice(0, 6),
      rows,
      meta,
    });
  } catch (err) {
    return errorResponse(err, "Eroare la citirea fișierului.");
  }
}


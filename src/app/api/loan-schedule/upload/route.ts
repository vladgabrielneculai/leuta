import { NextRequest, NextResponse } from "next/server";
import { parseExcelBuffer, parsePdfBuffer } from "@/lib/scheduleParser";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const loanId = Number(formData.get("loanId"));

    if (!file) {
      return NextResponse.json({ error: "Nu a fost selectat niciun fișier." }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rows: ReturnType<typeof parseExcelBuffer> = [];

    if (filename.endsWith(".xlsx") || filename.endsWith(".xls") || filename.endsWith(".csv")) {
      rows = parseExcelBuffer(buffer);
    } else if (filename.endsWith(".pdf")) {
      rows = await parsePdfBuffer(buffer);
    } else {
      return NextResponse.json({ error: "Format nesuportat. Te rugăm să încarci un fișier Excel (.xlsx, .xls), CSV sau PDF (.pdf)." }, { status: 400 });
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
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Eroare la citirea fișierului." }, { status: 500 });
  }
}


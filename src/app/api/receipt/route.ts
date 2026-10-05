import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { buildReceipt } from "@/lib/receipt/model";
import { receiptFilename, renderReceiptPdf } from "@/lib/receipt/pdf";

export const dynamic = "force-dynamic";

/** Bonul lunii (PDF, în stil de bon de casă) cu veniturile și cheltuielile utilizatorului curent. */
export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get("month") ?? "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: "Luna trebuie să fie în formatul AAAA-LL." }, { status: 400 });
    }
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
    const pdf = await renderReceiptPdf(await buildReceipt(month, session.username));
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receiptFilename(month)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, "Bonul lunii nu a putut fi generat.");
  }
}

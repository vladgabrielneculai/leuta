import { NextRequest, NextResponse } from "next/server";
import { errorResponse, MAX_UPLOAD_BYTES } from "@/lib/http";
import { betaOnly, parseUpload, preview } from "@/lib/importServer";

export const dynamic = "force-dynamic";

/**
 * Citește extrasul încărcat și întoarce tranzacțiile cu categoria propusă, fără să salveze nimic.
 * Dacă antetul nu e recunoscut, cere alegerea coloanelor (o dată pe format; alegerea se reține).
 */
export async function POST(req: NextRequest) {
  const blocked = betaOnly();
  if (blocked) return blocked;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Alege fișierul cu extrasul." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Fișierul este prea mare (maxim 10 MB)." }, { status: 413 });

    const rawMapping = form.get("mapping");
    const mapping = typeof rawMapping === "string" && rawMapping ? JSON.parse(rawMapping) : undefined;
    const result = await parseUpload(file, mapping);
    if (result.status === "needs-mapping") return NextResponse.json(result);
    if (!result.transactions.length) {
      return NextResponse.json({ error: "Nu am găsit tranzacții în fișier. Verifică dacă e extrasul de cont exportat din aplicația băncii." }, { status: 422 });
    }
    const { rows, categories } = await preview(result.transactions);
    return NextResponse.json({ status: "ok", bank: result.bank, filename: file.name, rows, categories });
  } catch (err) {
    return errorResponse(err, "Extrasul nu a putut fi citit.", 400);
  }
}

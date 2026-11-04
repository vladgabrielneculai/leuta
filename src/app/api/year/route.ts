import { NextRequest, NextResponse } from "next/server";
import { buildYear } from "@/lib/analytics";
import { isBetaDeployment } from "@/lib/beta";
import { errorResponse, jsonError } from "@/lib/http";
import { currentMonth } from "@/lib/util";

export const dynamic = "force-dynamic";

const YEAR = /^(19|20)\d{2}$/;

/** Raportul anual (beta): `?year=2026&compare=2025`; fără `compare` se compară cu anul dinainte, `compare=none` oprește comparația. */
export async function GET(req: NextRequest) {
  if (!isBetaDeployment()) return NextResponse.json({ error: "Pagina nu există." }, { status: 404 });
  const p = req.nextUrl.searchParams;
  const year = p.get("year") ?? currentMonth().slice(0, 4);
  if (!YEAR.test(year)) return jsonError("Anul trebuie să fie în formatul AAAA.");
  const rawCompare = p.get("compare");
  const compare = rawCompare === "none" ? null : rawCompare ?? String(Number(year) - 1);
  if (compare !== null && !YEAR.test(compare)) return jsonError("Anul comparat trebuie să fie în formatul AAAA.");
  try {
    return NextResponse.json(await buildYear(year, compare === year ? null : compare));
  } catch (e) {
    return errorResponse(e, "Raportul anual nu a putut fi calculat");
  }
}

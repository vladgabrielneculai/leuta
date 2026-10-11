import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { betaOnly } from "@/lib/importServer";

export const dynamic = "force-dynamic";

/** Regulile de categorisire învățate la import („kaufland” → Alimente). */
export async function GET() {
  const blocked = betaOnly();
  if (blocked) return blocked;
  try {
    const rows = await (await getDb())
      .prepare(
        `SELECT r.id, r.pattern, r.category_id, c.name AS category
         FROM import_rules r JOIN categories c ON c.id = r.category_id ORDER BY r.pattern`,
      )
      .all();
    return NextResponse.json(rows);
  } catch (err) {
    return errorResponse(err, "Regulile nu au putut fi încărcate.");
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = betaOnly();
  if (blocked) return blocked;
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Regulă invalidă." }, { status: 400 });
    const res = await (await getDb()).prepare("DELETE FROM import_rules WHERE id = ?").run(id);
    if (!res.changes) return NextResponse.json({ error: "Regula nu există." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Regula nu a putut fi ștearsă.");
  }
}

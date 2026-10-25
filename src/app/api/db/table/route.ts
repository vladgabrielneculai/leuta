import { NextRequest, NextResponse } from "next/server";
import { errorResponse, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { DB_TABLES } from "@/lib/crud";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Explorarea tabelelor e doar pentru administrator (și el vede doar rândurile proprii, prin RLS).
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const table = req.nextUrl.searchParams.get("table");
  if (!table || !DB_TABLES.includes(table)) return jsonError("Tabel invalid sau restricționat.");

  try {
    const db = await getDb();
    const columns = await db
      .prepare(
        `SELECT column_name AS name, data_type AS type, 0 AS pk
         FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? ORDER BY ordinal_position`,
      )
      .all<{ name: string; type: string; pk: number }>(table);
    const hasId = columns.some((c) => c.name === "id");
    const rows = await db.prepare(`SELECT * FROM "${table}" ${hasId ? "ORDER BY id" : ""} LIMIT 200`).all();
    return NextResponse.json({ table, columns, rows });
  } catch (err) {
    return errorResponse(err, "Eroare la citire tabel.");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const table = req.nextUrl.searchParams.get("table");
  const id = req.nextUrl.searchParams.get("id");
  if (!table || !DB_TABLES.includes(table) || !id) return jsonError("Date insuficiente.");

  try {
    const db = await getDb();
    await db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Eroare la ștergere rând.");
  }
}


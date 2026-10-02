import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALLOWED_TABLES = [
  "entries",
  "loans",
  "loan_prepayments",
  "loan_schedules",
  "categories",
  "goals",
  "investments",
  "investment_values",
  "user_settings",
  "fx_rates",
  "planned_purchases",
  "inflation_rates",
];

export async function GET(req: NextRequest) {
  const table = req.nextUrl.searchParams.get("table");
  if (!table || !ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: "Tabel invalid sau restricționat." }, { status: 400 });
  }

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
    return NextResponse.json({ error: err instanceof Error ? err.message : "Eroare la citire tabel." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const table = req.nextUrl.searchParams.get("table");
  const id = req.nextUrl.searchParams.get("id");
  if (!table || !ALLOWED_TABLES.includes(table) || !id) {
    return NextResponse.json({ error: "Date insuficiente." }, { status: 400 });
  }

  try {
    const db = await getDb();
    await db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Eroare la ștergere rând." }, { status: 500 });
  }
}


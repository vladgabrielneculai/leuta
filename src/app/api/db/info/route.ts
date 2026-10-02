import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const TABLES = [
  "entries", "loans", "loan_prepayments", "loan_schedules", "categories", "goals",
  "investments", "investment_values", "planned_purchases", "settings", "fx_rates", "inflation_rates",
];

export async function GET() {
  const db = await getDb();
  // Un singur round-trip: numărul de rânduri pentru fiecare tabel + mărimea bazei de date.
  const counts = await db
    .prepare(`SELECT ${TABLES.map((t) => `(SELECT COUNT(*)::int FROM "${t}") AS "${t}"`).join(", ")},
              pg_database_size(current_database())::bigint AS size`)
    .get<Record<string, number | string>>();
  const sizeBytes = Number(counts?.size ?? 0);

  return NextResponse.json({
    path: "Supabase · proiect buget-personal (eu-central-1)",
    sizeBytes,
    sizeFormatted: `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`,
    tables: TABLES.map((name) => ({ name, count: Number(counts?.[name] ?? 0) })),
  });
}

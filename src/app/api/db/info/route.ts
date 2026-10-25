import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { DB_TABLES as TABLES } from "@/lib/crud";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Mărimea bazei de date și tabelele ei: doar pentru administrator. */
export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const db = await getDb();
  // Un singur round-trip: numărul de rânduri pentru fiecare tabel + mărimea bazei de date.
  const counts = await db
    .prepare(`SELECT ${TABLES.map((t) => `(SELECT COUNT(*)::int FROM "${t}") AS "${t}"`).join(", ")},
              pg_database_size(current_database())::bigint AS size`)
    .get<Record<string, number | string>>();
  const sizeBytes = Number(counts?.size ?? 0);

  return NextResponse.json({
    path: "Supabase · Postgres (eu-central-1)",
    sizeBytes,
    sizeFormatted: `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`,
    tables: TABLES.map((name) => ({ name, count: Number(counts?.[name] ?? 0) })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getDb, getSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Record<string, string | number>;
  const db = await getDb();
  const rows = Object.entries(body).filter(([k]) => !k.startsWith("fx_"));
  if (rows.length) {
    await db
      .prepare(
        `INSERT INTO settings (key, value) VALUES ${rows.map(() => "(?, ?)").join(",")}
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      )
      .run(...rows.flatMap(([k, v]) => [k, String(v)]));
  }
  return NextResponse.json(await getSettings());
}

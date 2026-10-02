import { NextRequest, NextResponse } from "next/server";
import { getDb, getSettings, isSystemSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Record<string, string | number>;
  const db = await getDb();
  // Doar preferințele personale; cheile de sistem (curs/inflație) nu se modifică de aici.
  const rows = Object.entries(body).filter(([k]) => !isSystemSetting(k) && /^[a-z_]+$/.test(k));
  if (rows.length) {
    await db
      .prepare(
        `INSERT INTO user_settings (key, value) VALUES ${rows.map(() => "(?, ?)").join(",")}
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      )
      .run(...rows.flatMap(([k, v]) => [k, String(v)]));
  }
  return NextResponse.json(await getSettings());
}

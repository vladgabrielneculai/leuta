import { NextRequest, NextResponse } from "next/server";
import { getDb, getSettings, isSystemSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Record<string, string | number | boolean>;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });
  const db = await getDb();
  // Doar preferințele personale; cheile de sistem (curs/inflație) nu se modifică de aici.
  // Doar valori simple și scurte (preferințele sunt numere, „0”/„1” sau texte mici).
  const rows = Object.entries(body).filter(
    ([k, v]) => !isSystemSetting(k) && /^[a-z_]{1,64}$/.test(k) && ["string", "number", "boolean"].includes(typeof v) && String(v).length <= 2000,
  );
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

import { NextRequest, NextResponse } from "next/server";
import { getDb, IDENTITY_TABLES } from "@/lib/db";

export const dynamic = "force-dynamic";

// Ordinea respectă cheile străine (părinții înaintea copiilor).
const ORDER = [
  "settings", "fx_rates", "categories", "goals", "investments", "loans", "entries",
  "investment_values", "loan_prepayments", "loan_schedules", "planned_purchases",
];

export async function GET() {
  const db = await getDb();
  const dump: Record<string, unknown[]> = {};
  for (const t of ORDER) dump[t] = await db.prepare(`SELECT * FROM ${t}`).all();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify({ version: 1, exported: new Date().toISOString(), data: dump }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="buget-backup-${stamp}.json"`,
    },
  });
}

// Restaurarea înlocuiește complet datele existente.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { version: number; data: Record<string, Record<string, unknown>[]> };
    if (body.version !== 1 || !body.data) throw new Error("Fișierul nu este un backup valid al aplicației");
    const db = await getDb();
    await db.transaction(async (tx) => {
      // Ștergem copiii înaintea părinților, apoi inserăm în ordinea inversă.
      // Doar tabelele prezente în backup (un backup mai vechi nu conține planned_purchases → le păstrăm).
      for (const t of [...ORDER].reverse()) if (body.data[t]) await tx.prepare(`DELETE FROM ${t}`).run();
      for (const t of ORDER) {
        const rows = body.data[t] ?? [];
        for (const row of rows) {
          const keys = Object.keys(row);
          if (keys.some((k) => !/^[a-z_]+$/.test(k))) throw new Error(`Coloană invalidă în ${t}`);
          await tx
            .prepare(`INSERT INTO ${t} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")}) ON CONFLICT DO NOTHING`)
            .run(...keys.map((k) => row[k]));
        }
      }
      // Id-urile au fost inserate explicit, deci aducem secvențele după ele (altfel următorul INSERT ar da conflict).
      for (const t of IDENTITY_TABLES) {
        await tx.exec(
          `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`,
        );
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Restaurarea nu a reușit" }, { status: 400 });
  }
}

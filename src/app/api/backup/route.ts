import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Backup / restaurare pentru utilizatorul logat.
 *
 * Exportul conține doar datele utilizatorului (Postgres filtrează prin RLS). La restaurare, id-urile
 * vechi NU se refolosesc (în baza comună pot aparține altui cont): fiecare rând primește un id nou,
 * iar legăturile (categorie, obiectiv, investiție, credit) sunt refăcute prin tabele de corespondență.
 * Merge și cu backup-urile vechi, din versiunea locală (care aveau `settings` în loc de `user_settings`).
 */

// Ordinea respectă cheile străine (părinții înaintea copiilor).
const ORDER = [
  "categories", "goals", "investments", "loans", "entries",
  "investment_values", "loan_prepayments", "loan_schedules", "planned_purchases",
] as const;

// coloană → tabelul părinte al cărui id îl referă
const FKS: Record<string, Record<string, string>> = {
  entries: { category_id: "categories", goal_id: "goals", investment_id: "investments" },
  investment_values: { investment_id: "investments" },
  loan_prepayments: { loan_id: "loans" },
  loan_schedules: { loan_id: "loans" },
};

const HAS_ID = new Set(["categories", "goals", "investments", "loans", "entries", "loan_prepayments", "loan_schedules", "planned_purchases"]);

export async function GET() {
  const db = await getDb();
  const dump: Record<string, unknown[]> = {};
  dump.user_settings = await db.prepare("SELECT key, value FROM user_settings").all();
  for (const t of ORDER) {
    const rows = await db.prepare(`SELECT * FROM ${t}`).all<Record<string, unknown>>();
    dump[t] = rows.map(({ user_id: _owner, ...rest }) => rest); // proprietarul nu face parte din backup
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify({ version: 2, exported: new Date().toISOString(), data: dump }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="buget-backup-${stamp}.json"`,
    },
  });
}

// Restaurarea înlocuiește complet datele utilizatorului curent (ale celorlalți nu sunt atinse).
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { version: number; data: Record<string, Record<string, unknown>[]> };
    if (![1, 2].includes(body.version) || !body.data) throw new Error("Fișierul nu este un backup valid al aplicației");
    const db = await getDb();

    await db.transaction(async (tx) => {
      // Ștergem doar tabelele prezente în backup (copiii înaintea părinților).
      for (const t of [...ORDER].reverse()) if (body.data[t]) await tx.prepare(`DELETE FROM ${t}`).run();

      // Preferințele: `user_settings` (v2) sau `settings` (backup-uri vechi), fără cheile de sistem.
      const prefs = body.data.user_settings ?? body.data.settings ?? [];
      for (const r of prefs) {
        const key = String(r.key ?? "");
        if (!/^[a-z_]+$/.test(key) || /^(fx_|inflation_last_|inflation_source)/.test(key)) continue;
        await tx
          .prepare("INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value")
          .run(key, String(r.value ?? ""));
      }

      const idMap: Record<string, Map<unknown, number>> = {};
      for (const t of ORDER) {
        const rows = body.data[t];
        if (!rows) continue;
        idMap[t] = new Map();
        for (const row of rows) {
          const oldId = row.id;
          const rec: Record<string, unknown> = { ...row };
          delete rec.id;
          delete rec.user_id;
          for (const [col, parent] of Object.entries(FKS[t] ?? {})) {
            if (rec[col] === null || rec[col] === undefined) continue;
            const mapped = idMap[parent]?.get(rec[col]);
            rec[col] = mapped ?? null; // părinte lipsă din backup → legătură goală, nu rând orfan
          }
          if ((t === "investment_values" && rec.investment_id === null) || (FKS[t]?.loan_id && rec.loan_id === null)) continue;
          const keys = Object.keys(rec);
          if (keys.some((k) => !/^[a-z_]+$/.test(k))) throw new Error(`Coloană invalidă în ${t}`);
          const res = await tx
            .prepare(`INSERT INTO ${t} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")}) ON CONFLICT DO NOTHING`)
            .run(...keys.map((k) => rec[k]));
          if (HAS_ID.has(t) && oldId !== undefined && res.lastInsertRowid) idMap[t].set(oldId, res.lastInsertRowid);
        }
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Restaurarea nu a reușit" }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { learnPattern } from "@/lib/importRules";
import { betaOnly } from "@/lib/importServer";

export const dynamic = "force-dynamic";

type Row = { hash: string; date: string; amount: number; currency: string; description: string; categoryId: number; learn?: boolean };

const MAX_ROWS = 3000;

function valid(r: Row) {
  return (
    /^[0-9a-f]{40}$/.test(String(r.hash)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) &&
    typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount !== 0 && Math.abs(r.amount) < 1e9 &&
    (r.currency === "RON" || r.currency === "EUR") &&
    Number.isInteger(r.categoryId)
  );
}

/**
 * Salvează tranzacțiile confirmate ca intrări în buget (luna și tipul vin din dată și din categorie) și
 * reține categoriile alese ca reguli pentru importurile următoare. Tranzacțiile deja importate se sar.
 */
export async function POST(req: NextRequest) {
  const blocked = betaOnly();
  if (blocked) return blocked;
  try {
    const body = (await req.json()) as { rows?: Row[] };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return NextResponse.json({ error: "Nu ai ales nicio tranzacție." }, { status: 400 });
    if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Poți importa cel mult ${MAX_ROWS} de tranzacții odată.` }, { status: 400 });
    if (!rows.every(valid)) return NextResponse.json({ error: "Unele tranzacții nu sunt valide. Reîncarcă extrasul." }, { status: 400 });

    const db = await getDb();
    // Categoriile se citesc prin RLS, deci un id al altui cont nu trece.
    const cats = new Map(
      (await db.prepare("SELECT id, kind FROM categories").all<{ id: number; kind: string }>()).map((c) => [c.id, c.kind]),
    );
    for (const r of rows) {
      const kind = cats.get(r.categoryId);
      if (!kind) return NextResponse.json({ error: "O categorie aleasă nu mai există. Reîncarcă extrasul." }, { status: 400 });
      if ((r.amount > 0) !== (kind === "income")) {
        return NextResponse.json({ error: `„${r.description}”: o plată nu poate fi un venit și nici o încasare o cheltuială.` }, { status: 400 });
      }
    }

    const result = await db.transaction(async (tx) => {
      // În loturi: un extras pe un an are sute de rânduri, iar fiecare cerere separată la bază costă.
      let imported = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const values = batch.map(() => "(?, ?, ?, ?, ?, ?, 0, (?::date + time '12:00') AT TIME ZONE 'Europe/Bucharest', ?)").join(", ");
        const res = await tx
          .prepare(
            `INSERT INTO entries (month, kind, category_id, description, amount, currency, recurring, created_at, import_hash)
             VALUES ${values}
             ON CONFLICT (user_id, import_hash) WHERE import_hash IS NOT NULL DO NOTHING`,
          )
          .run(
            ...batch.flatMap((r) => [
              r.date.slice(0, 7), cats.get(r.categoryId), r.categoryId, String(r.description).slice(0, 200),
              Math.round(Math.abs(r.amount) * 100) / 100, r.currency, r.date, r.hash,
            ]),
          );
        imported += res.changes;
      }

      const learned = new Map<string, number>();
      for (const r of rows) {
        const pattern = r.learn ? learnPattern(String(r.description)) : null;
        if (pattern) learned.set(pattern, r.categoryId);
      }
      const upsert = tx.prepare(
        `INSERT INTO import_rules (pattern, category_id) VALUES (?, ?)
         ON CONFLICT (user_id, pattern) DO UPDATE SET category_id = EXCLUDED.category_id`,
      );
      for (const [pattern, categoryId] of learned) await upsert.run(pattern, categoryId);
      return { imported, skipped: rows.length - imported, rules: learned.size };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err, "Tranzacțiile nu au putut fi salvate.");
  }
}

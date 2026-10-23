import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { betaOnly } from "@/lib/importServer";
import { addMonth } from "@/lib/scheduled";
import { materializeDue } from "@/lib/scheduledServer";

export const dynamic = "force-dynamic";

type Item = { entryId: number; day: number; subscription?: boolean };

/**
 * Intrările recurente alese devin programări lunare, de la luna următoare intrării (luna ei are deja intrarea,
 * care se leagă de programare). Seria nu mai e „recurentă”, ca butonul de copiere să n-o dubleze.
 */
export async function POST(req: NextRequest) {
  const blocked = betaOnly();
  if (blocked) return blocked;
  try {
    const items = ((await req.json()).items ?? []) as Item[];
    if (!Array.isArray(items) || !items.length || items.length > 100) {
      return NextResponse.json({ error: "Alege intrările de transformat." }, { status: 400 });
    }
    if (!items.every((i) => Number.isInteger(i.entryId) && Number.isInteger(i.day) && i.day >= 1 && i.day <= 31)) {
      return NextResponse.json({ error: "Ziua trebuie să fie între 1 și 31." }, { status: 400 });
    }
    const db = await getDb();
    const converted = await db.transaction(async (tx) => {
      let n = 0;
      for (const it of items) {
        const e = await tx
          .prepare(
            `SELECT id, month, description, amount, currency, category_id FROM entries
             WHERE id = ? AND recurring = 1 AND scheduled_id IS NULL AND category_id IS NOT NULL AND goal_id IS NULL AND investment_id IS NULL`,
          )
          .get<{ id: number; month: string; description: string; amount: number; currency: string; category_id: number }>(it.entryId);
        if (!e) continue;
        const s = await tx
          .prepare(
            `INSERT INTO scheduled_entries (name, category_id, amount, currency, frequency, day, start_month, last_month, is_subscription)
             VALUES (?, ?, ?, ?, 'monthly', ?, ?, ?, ?)`,
          )
          .run(e.description || "Plată lunară", e.category_id, e.amount, e.currency, it.day, addMonth(e.month, 1), e.month, it.subscription ? 1 : 0);
        await tx.prepare("UPDATE entries SET scheduled_id = ?, recurring = 0 WHERE id = ?").run(s.lastInsertRowid, e.id);
        await tx
          .prepare("UPDATE entries SET recurring = 0 WHERE recurring = 1 AND scheduled_id IS NULL AND category_id = ? AND description = ?")
          .run(e.category_id, e.description);
        n++;
      }
      return n;
    });
    const created = await materializeDue(true);
    return NextResponse.json({ ok: true, converted, created });
  } catch (err) {
    return errorResponse(err, "Intrările nu au putut fi transformate.");
  }
}

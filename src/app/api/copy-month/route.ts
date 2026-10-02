import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Copiază în luna țintă intrările marcate ca recurente din luna sursă.
export async function POST(req: NextRequest) {
  const { from, to } = (await req.json()) as { from: string; to: string };
  const db = await getDb();
  const rows = await db.prepare("SELECT * FROM entries WHERE month = ? AND recurring = 1").all(from);
  const existsSql =
    "SELECT COUNT(*)::int AS c FROM entries WHERE month = ? AND kind = ? AND COALESCE(category_id,0) = COALESCE(?::int,0) AND description = ?";
  const insSql = (
    `INSERT INTO entries (month, kind, category_id, goal_id, investment_id, description, amount, currency, recurring)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  );
  let copied = 0;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const c = (await tx.prepare(existsSql).get<{ c: number }>(to, r.kind, r.category_id, r.description))!;
      if (c.c > 0) continue;
      await tx.prepare(insSql).run(to, r.kind, r.category_id, r.goal_id, r.investment_id, r.description, r.amount, r.currency);
      copied++;
    }
  });
  return NextResponse.json({ copied, skipped: rows.length - copied });
}

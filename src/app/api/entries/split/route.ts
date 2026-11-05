import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { insertRow, VALIDATE } from "@/lib/crud";
import { getDb } from "@/lib/db";
import { checkSplit } from "@/lib/entrySearch";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * O plată împărțită pe mai multe categorii, ca un singur bon: 200 mâncare + 80 casă.
 * Corp: câmpurile unei intrări (month, kind, created_at, description, currency, account_id) + `amount` total +
 * `parts: [{ category_id, amount }]`. Se creează câte o intrare pe categorie, toate cu același `split_group`,
 * într-o singură tranzacție. Fiecare parte rămâne o intrare obișnuită (se modifică sau se șterge separat).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!["variable", "fixed"].includes(body.kind)) throw new Error("Doar cheltuielile se pot împărți pe categorii.");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(body.month ?? ""))) throw new Error("Luna trebuie să fie în formatul AAAA-LL.");
    if (!["RON", "EUR"].includes(body.currency)) throw new Error("Moneda nu e validă.");
    const description = String(body.description ?? "").trim().slice(0, 500);
    const accountId = body.account_id === null || body.account_id === undefined || body.account_id === "" ? null : Number(body.account_id);
    if (accountId !== null && (!Number.isInteger(accountId) || accountId <= 0)) throw new Error("Contul nu e valid.");
    const parts = checkSplit(body.amount, body.parts);
    const group = randomUUID();
    const db = await getDb();
    const rows = await db.transaction(async (tx) => {
      const out: unknown[] = [];
      for (const p of parts) {
        const data: Record<string, unknown> = {
          month: body.month,
          kind: body.kind,
          category_id: p.category_id,
          description,
          amount: p.amount,
          currency: body.currency,
          recurring: 0,
          account_id: accountId,
          split_group: group,
        };
        if (body.created_at) data.created_at = body.created_at;
        VALIDATE.entries(data, true); // ziua tranzacției, ca la adăugarea obișnuită
        const info = await insertRow(tx, "entries", data);
        out.push(await tx.prepare("SELECT * FROM entries WHERE id = ?").get(info.lastInsertRowid));
      }
      return out;
    });
    return NextResponse.json({ ok: true, split_group: group, entries: rows });
  } catch (e) {
    return errorResponse(e, "Plata nu a putut fi împărțită", 400);
  }
}

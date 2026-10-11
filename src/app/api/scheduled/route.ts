import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { betaOnly } from "@/lib/importServer";
import { addMonth, today } from "@/lib/scheduled";
import { assertCategory, materializeDue, overview, parseScheduleInput } from "@/lib/scheduledServer";

export const dynamic = "force-dynamic";

/** Programările, abonamentele detectate, alertele și intrările recurente care pot deveni programări. */
export async function GET() {
  const blocked = betaOnly();
  if (blocked) return blocked;
  try {
    await materializeDue(true);
    return NextResponse.json(await overview());
  } catch (err) {
    return errorResponse(err, "Programările nu au putut fi încărcate.");
  }
}

export async function POST(req: NextRequest) {
  const blocked = betaOnly();
  if (blocked) return blocked;
  try {
    const s = parseScheduleInput(await req.json());
    await assertCategory(s.category_id);
    const db = await getDb();
    const res = await db
      .prepare(
        `INSERT INTO scheduled_entries (name, category_id, amount, currency, frequency, day, month_of_year, start_month, end_month, is_subscription)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(s.name, s.category_id, s.amount, s.currency, s.frequency, s.day, s.month_of_year, s.start_month, s.end_month, s.is_subscription);
    const created = await materializeDue(true);
    return NextResponse.json({ ok: true, id: res.lastInsertRowid, created });
  } catch (err) {
    return errorResponse(err, "Programarea nu a putut fi salvată.", 400);
  }
}

/** Modificarea nu atinge intrările deja create; se aplică de la următoarea scadență. */
export async function PUT(req: NextRequest) {
  const blocked = betaOnly();
  if (blocked) return blocked;
  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new Error("Programare invalidă.");
    const db = await getDb();
    if (body.active !== undefined && Object.keys(body).length === 2) {
      // La repornire, lunile trecute în care a stat oprită se sar (nu se creează intrări pentru ele).
      const res = body.active
        ? await db
            .prepare("UPDATE scheduled_entries SET active = 1, last_month = GREATEST(COALESCE(last_month, ''), ?) WHERE id = ?")
            .run(addMonth(today().month, -1), id)
        : await db.prepare("UPDATE scheduled_entries SET active = 0 WHERE id = ?").run(id);
      if (!res.changes) return NextResponse.json({ error: "Programarea nu există." }, { status: 404 });
      return NextResponse.json({ ok: true, created: await materializeDue(true) });
    }
    const s = parseScheduleInput(body);
    await assertCategory(s.category_id);
    const res = await db
      .prepare(
        `UPDATE scheduled_entries SET name = ?, category_id = ?, amount = ?, currency = ?, frequency = ?, day = ?, month_of_year = ?,
           start_month = ?, end_month = ?, is_subscription = ? WHERE id = ?`,
      )
      .run(s.name, s.category_id, s.amount, s.currency, s.frequency, s.day, s.month_of_year, s.start_month, s.end_month, s.is_subscription, id);
    if (!res.changes) return NextResponse.json({ error: "Programarea nu există." }, { status: 404 });
    return NextResponse.json({ ok: true, created: await materializeDue(true) });
  } catch (err) {
    return errorResponse(err, "Programarea nu a putut fi modificată.", 400);
  }
}

/** Intrările create deja rămân în buget; doar legătura cu programarea dispare. */
export async function DELETE(req: NextRequest) {
  const blocked = betaOnly();
  if (blocked) return blocked;
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Programare invalidă." }, { status: 400 });
    const res = await (await getDb()).prepare("DELETE FROM scheduled_entries WHERE id = ?").run(id);
    if (!res.changes) return NextResponse.json({ error: "Programarea nu există." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Programarea nu a putut fi ștearsă.");
  }
}

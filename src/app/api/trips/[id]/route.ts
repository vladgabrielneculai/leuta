import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { getDb } from "@/lib/db";
import { currencyRates } from "@/lib/fx";
import type { Trip, TripDetail, TripExpense, TripFund } from "@/lib/trips";

export const dynamic = "force-dynamic";

/** O vacanță cu banii și cheltuielile ei, plus cursul BNR al monedelor folosite (pentru echivalentul în lei). */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Vacanță inexistentă." }, { status: 404 });
    const db = await getDb();
    const trip = await db.prepare("SELECT * FROM trips WHERE id = ?").get<Trip>(id);
    if (!trip) return NextResponse.json({ error: "Vacanța nu există." }, { status: 404 });
    const [funds, expenses] = await Promise.all([
      db.prepare("SELECT * FROM trip_funds WHERE trip_id = ? ORDER BY id").all<TripFund>(id),
      db.prepare("SELECT * FROM trip_expenses WHERE trip_id = ? ORDER BY date DESC, id DESC").all<TripExpense>(id),
    ]);
    // Un singur curs pe vacanță, de la finalul ei (sau de azi, dacă e în curs): leii sunt doar orientativi.
    const rates = await currencyRates(
      [trip.currency, ...funds.map((f) => f.currency), ...expenses.map((e) => e.currency)],
      trip.end_date,
    ).catch(() => ({}));
    const out: TripDetail = { trip, funds, expenses, rates };
    return NextResponse.json(out);
  } catch (e) {
    return errorResponse(e, "Vacanța nu a putut fi încărcată");
  }
}

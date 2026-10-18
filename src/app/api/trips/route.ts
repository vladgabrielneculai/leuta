import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { getDb } from "@/lib/db";
import type { Trip, TripListItem } from "@/lib/trips";

export const dynamic = "force-dynamic";

/** Vacanțele utilizatorului, cele mai recente primele, cu banii avuți și cheltuiți adunați pe monede. */
export async function GET() {
  try {
    const db = await getDb();
    const [trips, funds, spent] = await Promise.all([
      db.prepare("SELECT * FROM trips ORDER BY start_date DESC, id DESC").all<Trip>(),
      db.prepare("SELECT trip_id, currency, SUM(amount) AS total FROM trip_funds GROUP BY trip_id, currency")
        .all<{ trip_id: number; currency: string; total: number }>(),
      db.prepare("SELECT trip_id, currency, SUM(amount) AS total FROM trip_expenses GROUP BY trip_id, currency")
        .all<{ trip_id: number; currency: string; total: number }>(),
    ]);
    const byTrip = (rows: { trip_id: number; currency: string; total: number }[], id: number) =>
      Object.fromEntries(rows.filter((r) => r.trip_id === id).map((r) => [r.currency, Number(r.total)]));
    const out: TripListItem[] = trips.map((t) => ({ ...t, funds: byTrip(funds, t.id), spent: byTrip(spent, t.id) }));
    return NextResponse.json(out);
  } catch (e) {
    return errorResponse(e, "Vacanțele nu au putut fi încărcate");
  }
}

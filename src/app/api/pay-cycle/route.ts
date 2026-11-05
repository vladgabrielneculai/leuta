import { NextRequest, NextResponse } from "next/server";
import { getDb, getSetting, setSetting, type DbInterface } from "@/lib/db";
import { errorResponse, jsonError } from "@/lib/http";
import { cycleActive, isWeekendRule, parseSortedCycle, resortMoves, sameCycle, type EntryDate, type Move, type PayCycle } from "@/lib/payCycle";
import { loadPayCycle } from "@/lib/profileServer";

export const dynamic = "force-dynamic";

/**
 * Luna de buget de la salariu la salariu (opțională, pentru fiecare utilizator).
 *
 * GET  → ciclul curent și câte intrări existente ar trebui mutate ca să i se potrivească.
 * PUT  { enabled?, weekend?, resort? } → salvează opțiunea; cu `resort`, mută și intrările existente.
 *
 * `budget_cycle_sorted` ține minte după ce regulă au fost împărțite ultima dată intrările, ca la oprire sau la
 * schimbarea zilei de salariu să știm ce intrări au fost puse automat și să le mutăm înapoi corect.
 */

const SORTED_KEY = "budget_cycle_sorted";

async function entryDates(db: DbInterface): Promise<EntryDate[]> {
  // Intrările din programări au ca dată ziua scadenței (due_date), restul ziua tranzacției.
  const rows = await db
    .prepare(
      `SELECT e.id, e.month, e.recurring,
              COALESCE(to_char(e.due_date, 'YYYY-MM-DD'), to_char(e.created_at AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD')) AS day
       FROM entries e WHERE e.recurring = 0 AND (e.created_at IS NOT NULL OR e.due_date IS NOT NULL)`,
    )
    .all<{ id: number; month: string; day: string | null; recurring: number }>();
  return rows.map((r) => ({ id: r.id, month: r.month, date: r.day, recurring: r.recurring }));
}

async function pendingMoves(db: DbInterface, cycle: PayCycle): Promise<Move[]> {
  const sorted = parseSortedCycle(await getSetting(SORTED_KEY));
  if (sameCycle(sorted, cycle)) return [];
  return resortMoves(await entryDates(db), sorted, cycle);
}

async function applyMoves(db: DbInterface, moves: Move[]) {
  let moved = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < moves.length; i += 200) {
      const batch = moves.slice(i, i + 200);
      const res = await tx
        .prepare(
          `UPDATE entries e SET month = v.to_month
           FROM (VALUES ${batch.map(() => "(?::int, ?, ?)").join(", ")}) AS v(id, from_month, to_month)
           WHERE e.id = v.id AND e.month = v.from_month`,
        )
        .run(...batch.flatMap((m) => [m.id, m.from, m.to]));
      moved += res.changes;
    }
  });
  return moved;
}

function view(cycle: PayCycle, moves: Move[]) {
  const months = [...new Set(moves.flatMap((m) => [m.from, m.to]))].sort();
  return { cycle, active: cycleActive(cycle), pending: moves.length, months };
}

export async function GET() {
  try {
    const cycle = await loadPayCycle();
    return NextResponse.json(view(cycle, await pendingMoves(await getDb(), cycle)));
  } catch (err) {
    return errorResponse(err, "Setarea lunii de buget nu a putut fi citită.");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { enabled?: unknown; weekend?: unknown; resort?: unknown };
    if (!body || typeof body !== "object") return jsonError("Cerere invalidă.");
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") return jsonError("Cerere invalidă.");
    if (body.weekend !== undefined && !isWeekendRule(body.weekend)) return jsonError("Regula pentru weekend nu e validă.");
    if (body.enabled === true && (await loadPayCycle()).payday === null) {
      return jsonError("Completează întâi ziua salariului în profil.");
    }

    if (body.enabled !== undefined) await setSetting("budget_from_payday", body.enabled ? "1" : "0");
    if (body.weekend !== undefined) await setSetting("payday_weekend", body.weekend as string);

    const db = await getDb();
    const cycle = await loadPayCycle();
    let moves = await pendingMoves(db, cycle);
    let moved = 0;
    if (body.resort === true) {
      moved = await applyMoves(db, moves);
      await setSetting(SORTED_KEY, JSON.stringify(cycle));
      moves = [];
    }
    return NextResponse.json({ ...view(cycle, moves), moved });
  } catch (err) {
    return errorResponse(err, "Setarea lunii de buget nu a putut fi salvată.", 400);
  }
}

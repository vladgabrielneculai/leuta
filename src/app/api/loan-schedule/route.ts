import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { getDb, type DbInterface } from "@/lib/db";
import { TABLES } from "@/lib/crud";

export const dynamic = "force-dynamic";

export type ScheduleEntry = {
  id?: number;
  loan_id: number;
  month: string;
  installment_nr: number;
  balance_start: number;
  principal: number;
  interest: number;
  fee: number;
  payment: number;
  balance_end: number;
  is_paid: number;
};

export async function GET(req: NextRequest) {
  const loanId = req.nextUrl.searchParams.get("loanId");
  if (!loanId) return NextResponse.json({ error: "Lipsește loanId" }, { status: 400 });

  const db = await getDb();
  const rows = await db
    .prepare("SELECT * FROM loan_schedules WHERE loan_id = ? ORDER BY installment_nr ASC")
    .all<ScheduleEntry>(Number(loanId));

  return NextResponse.json({ loanId: Number(loanId), entries: rows });
}

/** Doar coloanele cunoscute ale creditului (aceeași listă ca la CRUD). */
function loanFields(data: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  if (!data) return out;
  for (const col of TABLES.loans.columns) {
    if (!(col in data)) continue;
    let v = data[col];
    if (typeof v === "boolean") v = v ? 1 : 0;
    if (v === "" && col.endsWith("_date") && col !== "start_date") v = null;
    out[col] = v;
  }
  return out;
}

async function insertLoan(tx: DbInterface, data: Record<string, unknown>) {
  const keys = Object.keys(data);
  const info = await tx
    .prepare(`INSERT INTO loans (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
    .run(...keys.map((k) => data[k]));
  return info.lastInsertRowid;
}

async function updateLoan(tx: DbInterface, id: number, data: Record<string, unknown>) {
  const keys = Object.keys(data);
  if (!keys.length) return true;
  const res = await tx
    .prepare(`UPDATE loans SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...keys.map((k) => data[k]), id);
  return res.changes > 0;
}

/**
 * Salvează graficul băncii pentru un credit și îl face sursa calculelor (use_schedule = 1).
 * Opțional, în aceeași tranzacție: `loanPatch` actualizează creditul (date citite din PDF / situația la zi),
 * iar `createLoan` creează întâi un credit nou (import „Adaugă credit din PDF”).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { entries, loanPatch, createLoan, source } = body as {
      loanId?: number;
      entries: Omit<ScheduleEntry, "id" | "loan_id">[];
      loanPatch?: Record<string, unknown>;
      createLoan?: Record<string, unknown>;
      source?: string;
    };
    let loanId = Number(body.loanId) || 0;

    if ((!loanId && !createLoan) || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }

    const db = await getDb();
    const missing = await db.transaction(async (tx) => {
      const flags = { use_schedule: 1, ...(source ? { schedule_source: source } : {}) };
      if (createLoan) {
        const data = loanFields({ ...createLoan, ...flags });
        if (!data.name || !(Number(data.principal) > 0) || !data.start_date) {
          throw new Error("Lipsesc datele creditului (nume, sumă, data acordării).");
        }
        loanId = await insertLoan(tx, data);
      } else if (!(await updateLoan(tx, loanId, loanFields({ ...loanPatch, ...flags })))) {
        return true; // creditul nu există sau e al altui cont
      }

      await tx.prepare("DELETE FROM loan_schedules WHERE loan_id = ?").run(loanId);

      // Numerele ratelor sunt unice per credit; dacă fișierul le repetă, le renumerotăm în ordine.
      const renumber = new Set(entries.map((e) => e.installment_nr)).size !== entries.length;

      // Un scadențar are până la ~360 de rate: le inserăm în loturi, nu rând cu rând (fiecare rând = un round-trip).
      const CHUNK = 200;
      for (let i = 0; i < entries.length; i += CHUNK) {
        const part = entries.slice(i, i + CHUNK);
        await tx
          .prepare(
            `INSERT INTO loan_schedules (
              loan_id, month, installment_nr, balance_start, principal,
              interest, fee, payment, balance_end, is_paid
            ) VALUES ${part.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",")}`,
          )
          .run(...part.flatMap((r, j) => [
          loanId,
          r.month,
          renumber ? i + j + 1 : r.installment_nr,
          Number(r.balance_start) || 0,
          Number(r.principal) || 0,
          Number(r.interest) || 0,
          Number(r.fee) || 0,
          Number(r.payment) || 0,
          Number(r.balance_end) || 0,
          r.is_paid ? 1 : 0,
        ]));
      }
      return false;
    });

    if (missing) return NextResponse.json({ error: "Creditul nu există." }, { status: 404 });
    return NextResponse.json({ ok: true, loanId, count: entries.length });
  } catch (err) {
    return errorResponse(err, "Eroare la salvare");
  }
}

export async function DELETE(req: NextRequest) {
  const loanId = req.nextUrl.searchParams.get("loanId");
  if (!loanId) return NextResponse.json({ error: "Lipsește loanId" }, { status: 400 });

  await (await getDb()).transaction(async (tx) => {
    await tx.prepare("DELETE FROM loan_schedules WHERE loan_id = ?").run(Number(loanId));
    // Fără grafic, creditul revine la calculul din parametrii contractului.
    await tx.prepare("UPDATE loans SET use_schedule = 0, schedule_source = '' WHERE id = ?").run(Number(loanId));
  });
  return NextResponse.json({ ok: true });
}


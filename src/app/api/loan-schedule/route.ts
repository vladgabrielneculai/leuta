import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { loanId, entries } = body as { loanId: number; entries: Omit<ScheduleEntry, "id">[] };

    if (!loanId || !Array.isArray(entries)) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }

    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.prepare("DELETE FROM loan_schedules WHERE loan_id = ?").run(loanId);

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
          .run(...part.flatMap((r) => [
          loanId,
          r.month,
          r.installment_nr,
          Number(r.balance_start) || 0,
          Number(r.principal) || 0,
          Number(r.interest) || 0,
          Number(r.fee) || 0,
          Number(r.payment) || 0,
          Number(r.balance_end) || 0,
          r.is_paid ? 1 : 0,
        ]));
      }
    });

    return NextResponse.json({ ok: true, count: entries.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Eroare la salvare" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const loanId = req.nextUrl.searchParams.get("loanId");
  if (!loanId) return NextResponse.json({ error: "Lipsește loanId" }, { status: 400 });

  await (await getDb()).prepare("DELETE FROM loan_schedules WHERE loan_id = ?").run(Number(loanId));
  return NextResponse.json({ ok: true });
}


import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { simulate, statusAt, type Loan, type Prepayment, type SimOptions } from "@/lib/loan";
import { currentMonth } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { loanId: number; scenario?: SimOptions };
  const db = await getDb();
  const loan = await db.prepare("SELECT * FROM loans WHERE id = ?").get<Loan>(body.loanId);
  if (!loan) return NextResponse.json({ error: "Creditul nu există" }, { status: 404 });
  const prepayments = await db.prepare("SELECT * FROM loan_prepayments WHERE loan_id = ? ORDER BY month").all<Prepayment>(loan.id);
  const sc = body.scenario ?? {};

  const original = simulate(loan, { irccOverride: sc.irccOverride, irccShock: sc.irccShock });
  const actual = simulate(loan, { prepayments, irccOverride: sc.irccOverride, irccShock: sc.irccShock });
  const base = { ...sc, prepayments };
  const term = simulate(loan, { ...base, strategy: "term" });
  const installment = simulate(loan, { ...base, strategy: "installment" });

  const customSchedule = await db
    .prepare("SELECT * FROM loan_schedules WHERE loan_id = ? ORDER BY installment_nr ASC")
    .all(loan.id);

  const month = currentMonth();
  const slim = (r: ReturnType<typeof simulate>) => ({ ...r, status: statusAt(loan, r, month) });
  return NextResponse.json({
    loan,
    prepayments,
    customSchedule,
    original: slim(original),
    actual: slim(actual),
    term: slim(term),
    installment: slim(installment),
  });
}

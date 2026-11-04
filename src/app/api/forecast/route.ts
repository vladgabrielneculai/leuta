import { NextResponse } from "next/server";
import { buildSummary } from "@/lib/analytics";
import { isBetaDeployment } from "@/lib/beta";
import { getDb } from "@/lib/db";
import { forecast } from "@/lib/forecast";
import { errorResponse } from "@/lib/http";
import { daysInMonth, dueDate, today, type Schedule } from "@/lib/scheduled";
import { materializeQuietly } from "@/lib/scheduledServer";

export const dynamic = "force-dynamic";

/** Estimarea pentru luna curentă (beta). Celelalte luni sunt fie încheiate, fie încă goale: n-au estimare. */
export async function GET() {
  if (!isBetaDeployment()) return NextResponse.json({ error: "Pagina nu există." }, { status: 404 });
  try {
    await materializeQuietly(); // plățile scadente până azi devin intrări înainte de calcul
    const t = today();
    const [s, rows] = await Promise.all([
      buildSummary(t.month),
      (await getDb())
        .prepare(
          `SELECT s.*, c.kind FROM scheduled_entries s JOIN categories c ON c.id = s.category_id
           WHERE s.active = 1 AND (s.last_month IS NULL OR s.last_month < ?)`,
        )
        .all<Schedule & { kind: string }>(t.month)
        .catch(() => [] as (Schedule & { kind: string })[]),
    ]);
    const rate = s.fx.rate;
    const upcoming = rows
      .filter((r) => r.kind !== "saving" && r.start_month <= t.month && (!r.end_month || r.end_month >= t.month))
      .map((r) => ({ r, date: dueDate(r, t.month) }))
      .filter((x): x is { r: Schedule & { kind: string }; date: string } => !!x.date && x.date > t.date)
      .map(({ r, date }) => ({
        name: r.name,
        amount: r.currency === "EUR" ? Number(r.amount) * rate : Number(r.amount),
        kind: r.kind === "income" ? ("income" as const) : ("expense" as const),
        date,
      }));
    const tot = s.totals;
    const result = forecast({
      day: t.day,
      daysInMonth: daysInMonth(t.month),
      income: tot.income,
      fixed: tot.fixed,
      variable: tot.variable,
      loans: tot.loanPayments + tot.loanInsurance + tot.prepayFees,
      saved: tot.savedTotal,
      priorVariable: s.trend.slice(0, -1).filter((m) => m.hasData).map((m) => m.variable),
      upcoming,
    });
    return NextResponse.json({ month: t.month, ...result, upcoming: upcoming.sort((a, b) => a.date.localeCompare(b.date)) });
  } catch (e) {
    return errorResponse(e, "Estimarea nu a putut fi calculată");
  }
}

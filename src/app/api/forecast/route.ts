import { NextResponse } from "next/server";
import { buildSummary } from "@/lib/analytics";
import { isBetaDeployment } from "@/lib/beta";
import { getDb } from "@/lib/db";
import { forecast } from "@/lib/forecast";
import { errorResponse } from "@/lib/http";
import { duesBetween, type Schedule } from "@/lib/scheduled";
import { budgetMonthProgress, currentBudgetMonth, cycleActive, todayRo } from "@/lib/payCycle";
import { loadPayCycle } from "@/lib/profileServer";
import { materializeQuietly } from "@/lib/scheduledServer";

export const dynamic = "force-dynamic";

/**
 * Estimarea pentru luna curentă (beta). Celelalte luni sunt fie încheiate, fie încă goale: n-au estimare.
 * Cu luna de la salariu, luna curentă e luna de buget, iar „finalul” e ziua dinaintea salariului următor.
 * Plățile programate intră în luna de buget a scadenței, deci se numără cele cu scadența după azi și până la
 * finalul lunii de buget, chiar dacă trec în luna calendaristică următoare.
 */
export async function GET() {
  if (!isBetaDeployment()) return NextResponse.json({ error: "Pagina nu există." }, { status: 404 });
  try {
    await materializeQuietly(); // plățile scadente până azi devin intrări înainte de calcul
    const cycle = await loadPayCycle();
    const date = todayRo();
    const month = currentBudgetMonth(cycle, date);
    const period = budgetMonthProgress(month, cycle, date);
    const [s, rows] = await Promise.all([
      buildSummary(month),
      (await getDb())
        .prepare(
          `SELECT s.*, c.kind FROM scheduled_entries s JOIN categories c ON c.id = s.category_id
           WHERE s.active = 1`,
        )
        .all<Schedule & { kind: string }>()
        .catch(() => [] as (Schedule & { kind: string })[]),
    ]);
    const rate = s.fx.rate;
    const upcoming = rows
      .filter((r) => r.kind !== "saving")
      // Doar scadențele încă necreate ca intrări (`last_month` = ultima lună calendaristică creată).
      .flatMap((r) => duesBetween(r, period.start, period.end).filter((d) => d.date > date && (!r.last_month || r.last_month < d.month)).map((d) => ({ r, date: d.date })))
      .map(({ r, date }) => ({
        name: r.name,
        amount: r.currency === "EUR" ? Number(r.amount) * rate : Number(r.amount),
        kind: r.kind === "income" ? ("income" as const) : ("expense" as const),
        date,
      }));
    const tot = s.totals;
    const result = forecast({
      day: period.day,
      daysInMonth: period.length,
      income: tot.income,
      fixed: tot.fixed,
      variable: tot.variable,
      loans: tot.loanPayments + tot.loanInsurance + tot.prepayFees,
      saved: tot.savedTotal,
      priorVariable: s.trend.slice(0, -1).filter((m) => m.hasData).map((m) => m.variable),
      upcoming,
    });
    return NextResponse.json({ month, end: period.end, fromPayday: cycleActive(cycle), ...result, upcoming: upcoming.sort((a, b) => a.date.localeCompare(b.date)) });
  } catch (e) {
    return errorResponse(e, "Estimarea nu a putut fi calculată");
  }
}

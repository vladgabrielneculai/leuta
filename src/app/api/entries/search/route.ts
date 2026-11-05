import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { filtersSql, parseFilters, toCsv, totalsOf, type FoundEntry } from "@/lib/entrySearch";
import { loadRates, rateForMonthFrom } from "@/lib/fx";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Câte rânduri trimitem paginii; totalurile și exportul CSV le cuprind pe toate. */
const PAGE_LIMIT = 300;

/**
 * Căutare în toate intrările contului. `?format=csv` descarcă aceleași rezultate ca fișier CSV.
 * Rândurile sunt filtrate pe utilizator de Postgres (RLS), ca peste tot în aplicație.
 */
export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);
    const { where, params } = filtersSql(filters);
    const db = await getDb();
    const [raw, rates] = await Promise.all([
      db
        .prepare(
          `SELECT e.id, e.month, e.kind, e.category_id, e.goal_id, e.investment_id, e.description, e.amount, e.currency,
                  e.recurring, e.created_at, e.account_id, e.split_group, c.name AS category,
                  (SELECT string_agg(t.name, ', ' ORDER BY lower(t.name)) FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = e.id) AS tags,
                  to_char(e.created_at AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD') AS day
           FROM entries e LEFT JOIN categories c ON c.id = e.category_id
           ${where}
           ORDER BY e.month DESC, e.created_at DESC NULLS LAST, e.id DESC`,
        )
        .all<Omit<FoundEntry, "ron">>(...params),
      loadRates(),
    ]);
    const fx = new Map<string, number>();
    const rateFor = (m: string) => {
      if (!fx.has(m)) fx.set(m, rateForMonthFrom(rates, m).rate);
      return fx.get(m)!;
    };
    const rows: FoundEntry[] = raw.map((r) => ({
      ...r,
      amount: Number(r.amount),
      ron: r.currency === "EUR" ? Number(r.amount) * rateFor(r.month) : Number(r.amount),
    }));

    if (req.nextUrl.searchParams.get("format") === "csv") {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
      return new NextResponse(toCsv(rows), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="leuta-intrari-${day}.csv"`,
          "cache-control": "no-store",
        },
      });
    }
    return NextResponse.json({ rows: rows.slice(0, PAGE_LIMIT), truncated: rows.length > PAGE_LIMIT, totals: totalsOf(rows) });
  } catch (e) {
    return errorResponse(e, "Căutarea nu a reușit", 400);
  }
}

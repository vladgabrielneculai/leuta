import { NextRequest, NextResponse } from "next/server";
import { balances, totalRon, type Account, type AccountEntry, type Transfer } from "@/lib/accounts";
import { insertRow, VALIDATE } from "@/lib/crud";
import { getDb } from "@/lib/db";
import { loadRates, rateForMonthFrom } from "@/lib/fx";
import { errorResponse } from "@/lib/http";
import { currentMonth } from "@/lib/util";

export const dynamic = "force-dynamic";


/** Conturile cu soldul de azi, totalul în lei și ultimele transferuri. */
export async function GET() {
  try {
    const db = await getDb();
    const [accounts, entries, transfers, rates] = await Promise.all([
      db.prepare("SELECT id, name, kind, currency, opening_balance, opening_date, archived FROM accounts ORDER BY archived, id").all<Account>(),
      db
        .prepare(
          `SELECT account_id, kind, amount, currency, month,
                  to_char(created_at AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD') AS day
           FROM entries WHERE account_id IS NOT NULL`,
        )
        .all<AccountEntry>(),
      db.prepare("SELECT id, from_account_id, to_account_id, amount, to_amount, date, note FROM transfers ORDER BY date DESC, id DESC").all<Transfer>(),
      loadRates(),
    ]);
    const cache = new Map<string, number>();
    const rate = (m: string) => {
      if (!cache.has(m)) cache.set(m, rateForMonthFrom(rates, m).rate);
      return cache.get(m)!;
    };
    const num = (a: Account) => ({ ...a, opening_balance: Number(a.opening_balance) });
    const list = balances(
      accounts.map(num),
      entries.map((e) => ({ ...e, amount: Number(e.amount) })),
      transfers.map((t) => ({ ...t, amount: Number(t.amount), to_amount: t.to_amount === null ? null : Number(t.to_amount) })),
      rate,
    );
    const month = currentMonth();
    return NextResponse.json({ accounts: list, total: totalRon(list, month, rate), transfers: transfers.slice(0, 50), eurRate: rate(month) });
  } catch (e) {
    return errorResponse(e, "Conturile nu au putut fi încărcate");
  }
}

/**
 * Soldurile de azi (ghidul de început și „Adaugă soldurile” din Conturi): mai multe conturi deodată, într-o
 * singură tranzacție. Corp: { date: "YYYY-MM-DD", accounts: [{ name, kind, currency, opening_balance }] }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { date?: string; accounts?: Record<string, unknown>[] };
    const rows = (Array.isArray(body.accounts) ? body.accounts : []).filter((a) => String(a?.name ?? "").trim());
    if (!rows.length) throw new Error("Adaugă cel puțin un cont.");
    if (rows.length > 20) throw new Error("Prea multe conturi deodată.");
    const db = await getDb();
    const ids = await db.transaction(async (tx) => {
      const out: number[] = [];
      for (const a of rows) {
        const data: Record<string, unknown> = {
          name: a.name,
          kind: a.kind ?? "current",
          currency: a.currency ?? "RON",
          opening_balance: a.opening_balance ?? 0,
          opening_date: body.date,
          archived: 0,
        };
        VALIDATE.accounts(data, true);
        out.push((await insertRow(tx, "accounts", data)).lastInsertRowid);
      }
      return out;
    });
    return NextResponse.json({ ok: true, ids });
  } catch (e) {
    return errorResponse(e, "Conturile nu au putut fi salvate", 400);
  }
}

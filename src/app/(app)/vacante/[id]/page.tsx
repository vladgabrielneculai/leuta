"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { lei } from "@/lib/util";
import {
  dayLabel, daysBetween, fmtCur, PHASE_STYLE, periodLabel, ronRate, sumBy, todayIso, TRIP_CATEGORIES, tripCategory, tripPhase, walletRows,
  type TripDetail, type TripExpense, type TripFund,
} from "@/lib/trips";
import { FundForm, TripExpenseForm, TripForm } from "@/components/Trips";
import { api, Bar, Empty, Modal, PageHeader, Panel, PencilIcon, Skeleton, Stat, Toast, useApi, useApp } from "@/components/ui";

/** „mâine”, „în 5 zile”, „în 21 de zile”. */
function untilLabel(n: number) {
  if (n <= 1) return "mâine";
  return n % 100 >= 20 || n % 100 === 0 ? `în ${n} de zile` : `în ${n} zile`;
}

export default function TripPage() {
  const params = useParams();
  const id = Number(params?.id);
  const router = useRouter();
  const { bump, confirm } = useApp();
  const { data: d, error } = useApi<TripDetail>(Number.isInteger(id) ? `/api/trips/${id}` : null);
  const [editingTrip, setEditingTrip] = useState(false);
  const [fund, setFund] = useState<TripFund | "nou" | null>(null);
  const [expense, setExpense] = useState<TripExpense | "nou" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (error) {
    return (
      <Empty title="Vacanța nu s-a putut încărca">
        {error} <Link href="/vacante" className="text-albastru hover:underline">Înapoi la vacanțe</Link>
      </Empty>
    );
  }
  if (!d) return <Skeleton />;

  const { trip, funds, expenses, rates } = d;
  const phase = tripPhase(trip);
  const today = todayIso();
  const totalDays = daysBetween(trip.start_date, trip.end_date);
  const dayNr = phase === "acum" ? daysBetween(trip.start_date, today) : phase === "incheiata" ? totalDays : 0;
  const daysLeft = phase === "acum" ? daysBetween(today, trip.end_date) : phase === "viitoare" ? totalDays : 0;
  const wallet = walletRows(trip, funds, expenses);
  const main = wallet.find((w) => w.code === trip.currency)!;

  // Echivalentul în lei (doar informativ): cursul tău de cumpărare, apoi cursul BNR.
  const spentBy = sumBy(expenses, (e) => e.currency, (e) => e.amount);
  let totalRon = 0;
  const unconverted: [string, number][] = [];
  for (const [code, v] of Object.entries(spentBy)) {
    const r = ronRate(code, funds, rates);
    if (r === null) unconverted.push([code, v]);
    else totalRon += v * r;
  }
  const usesOwnRate = funds.some((f) => f.rate_ron && f.currency !== "RON");
  const bnrDate = Object.values(rates).find((r) => r?.date)?.date;

  // Ponderea categoriilor, în moneda vacanței (conversia e doar pentru procente; sumele rămân în moneda lor).
  const mainRate = ronRate(trip.currency, funds, rates);
  const inMain = (e: TripExpense) => {
    if (e.currency === trip.currency) return e.amount;
    const r = ronRate(e.currency, funds, rates);
    return r !== null && mainRate ? (e.amount * r) / mainRate : 0;
  };
  const totalMain = expenses.reduce((a, e) => a + inMain(e), 0);
  const categories = TRIP_CATEGORIES.map((c) => {
    const rows = expenses.filter((e) => tripCategory(e.category).key === c.key);
    return { ...c, share: rows.reduce((a, e) => a + inMain(e), 0), amounts: sumBy(rows, (e) => e.currency, (e) => e.amount) };
  }).filter((c) => Object.keys(c.amounts).length > 0);

  const byDay = Object.entries(
    expenses.reduce<Record<string, TripExpense[]>>((acc, e) => {
      (acc[e.date] ??= []).push(e);
      return acc;
    }, {}),
  ).sort(([a], [b]) => (a < b ? 1 : -1));

  const done = (msg: string) => {
    setFund(null);
    setExpense(null);
    setToast(msg);
    bump();
  };

  const removeTrip = async () => {
    const ok = await confirm({
      title: "Ștergere vacanță",
      message: `Sigur ștergi „${trip.name}”, cu toate cele ${expenses.length} cheltuieli și banii trecuți? Bugetul lunar nu e atins.`,
      confirmText: "Șterge vacanța",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/crud/trips?id=${trip.id}`, "DELETE");
      bump();
      router.push("/vacante");
    } catch (e) {
      setToast((e as Error).message);
    }
  };

  const removeRow = async (table: "trip_funds" | "trip_expenses", rowId: number, what: string) => {
    if (!(await confirm({ title: "Ștergere", message: `Sigur ștergi ${what}?`, confirmText: "Șterge", danger: true }))) return;
    try {
      await api(`/api/crud/${table}?id=${rowId}`, "DELETE");
      done(table === "trip_funds" ? "Bani șterși" : "Cheltuială ștearsă");
    } catch (e) {
      setToast((e as Error).message);
    }
  };

  const perDay = main.available > 0 && main.left > 0 && daysLeft > 0 ? main.left / daysLeft : null;
  const avgPerDay = dayNr > 0 ? (spentBy[trip.currency] ?? 0) / dayNr : null;

  return (
    <>
      <Link href="/vacante" className="mb-2 inline-block text-[13px] text-ink-soft hover:text-albastru">‹ Toate vacanțele</Link>
      <PageHeader
        title={trip.name}
        intro={
          <>
            {trip.destination && <>{trip.destination} · </>}
            {periodLabel(trip)} ·{" "}
            <span className="rounded px-1.5 py-0.5 text-[12px] font-medium" style={{ color: PHASE_STYLE[phase].color, background: PHASE_STYLE[phase].bg }}>
              {PHASE_STYLE[phase].label}
            </span>
          </>
        }
        actions={
          <>
            <button className="btn-ghost" onClick={() => setEditingTrip(true)}>Modifică</button>
            <button className="btn-danger" onClick={removeTrip}>Șterge</button>
            <button className="btn-ghost" onClick={() => setFund("nou")}>+ Am deja bani</button>
            <button className="btn-primary" onClick={() => setExpense("nou")}>+ Cheltuială</button>
          </>
        }
      />

      <div className="panel mb-6 grid grid-cols-2 gap-6 p-5 lg:grid-cols-4">
        <Stat label="Cheltuit" accent="var(--c-rosu)" hint={wallet.filter((w) => w.code !== trip.currency && w.spent > 0).map((w) => `+ ${fmtCur(w.spent, w.code)}`).join(" ")}>
          <span className="num font-display text-[17px] font-semibold sm:text-[20px]">{fmtCur(main.spent, trip.currency)}</span>
        </Stat>
        <Stat
          label={main.fromFunds ? "Rămași" : main.available > 0 ? "Rămas din buget" : "Buget"}
          accent={main.left < 0 ? "var(--c-rosu)" : "var(--c-albastru)"}
          hint={perDay ? `~${fmtCur(perDay, trip.currency)} pe zi${phase === "acum" ? " până la final" : ""}` : undefined}
        >
          {main.available > 0 ? (
            <span className={`num font-display text-[17px] font-semibold sm:text-[20px] ${main.left < 0 ? "text-rosu" : ""}`}>{fmtCur(main.left, trip.currency)}</span>
          ) : (
            <span className="text-[14px] text-ink-faint">nesetat</span>
          )}
        </Stat>
        <Stat
          label="Zile"
          accent="var(--c-galben)"
          hint={avgPerDay !== null ? `media ${fmtCur(avgPerDay, trip.currency)} pe zi` : undefined}
        >
          <span className="num font-display text-[17px] font-semibold sm:text-[20px]">
            {phase === "acum" ? `${dayNr} din ${totalDays}` : phase === "viitoare" ? untilLabel(daysBetween(today, trip.start_date) - 1) : totalDays}
          </span>
        </Stat>
        <Stat
          label="Toată vacanța în lei"
          accent="var(--c-leu)"
          hint={
            <>
              {unconverted.length > 0 && <>+ {unconverted.map(([c, v]) => fmtCur(v, c)).join(" + ")} neconvertit · </>}
              {usesOwnRate ? "cursul tău de cumpărare" : bnrDate ? `curs BNR ${bnrDate.split("-").reverse().join(".")}` : "orientativ"}
            </>
          }
        >
          <span className="num font-display text-[17px] font-semibold sm:text-[20px]">≈ {lei(totalRon)}</span>
        </Stat>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-6">
          <Panel title="Banii vacanței" aside={<button className="btn-ghost text-[13px]" onClick={() => setFund("nou")}>+ Adaugă</button>}>
            <div className="flex flex-col gap-4">
              {wallet.map((w) => (
                <div key={w.code}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{w.code === "RON" ? "lei" : w.code}</span>
                    {w.available > 0 ? (
                      <span className="num text-[14px]">
                        <strong className={w.left < 0 ? "text-rosu" : ""}>{fmtCur(w.left, w.code)}</strong>
                        <span className="text-ink-faint"> rămași din {fmtCur(w.available, w.code)}</span>
                      </span>
                    ) : (
                      <span className="num text-[14px]">cheltuit {fmtCur(w.spent, w.code)}</span>
                    )}
                  </div>
                  {w.available > 0 && (
                    <div className="mt-1.5">
                      <Bar value={w.spent} max={w.available} color={w.left < 0 ? "var(--c-rosu)" : "var(--c-albastru)"} />
                    </div>
                  )}
                  {w.available > 0 && !w.fromFunds && <p className="mt-1 text-[12px] text-ink-faint">din bugetul estimat</p>}
                </div>
              ))}
            </div>
            {funds.length > 0 ? (
              <ul className="mt-4 flex flex-col border-t border-dashed border-line-strong pt-2">
                {funds.map((f) => (
                  <li key={f.id}>
                    <button className="flex w-full items-center justify-between gap-3 py-2 text-left text-[14px] hover:text-albastru" onClick={() => setFund(f)}>
                      <span className="min-w-0 truncate">
                        {f.label || "Bani"}
                        {f.rate_ron ? <span className="text-[12px] text-ink-faint"> · cumpărați la {f.rate_ron.toLocaleString("ro-RO")} lei</span> : null}
                      </span>
                      <span className="num flex shrink-0 items-center gap-2">
                        {fmtCur(f.amount, f.currency)} <PencilIcon className="h-3.5 w-3.5 text-ink-faint" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 border-t border-dashed border-line-strong pt-3 text-[13px] text-ink-soft">
                Ai deja bani în {trip.currency === "RON" ? "lei" : trip.currency} pentru vacanță (schimbați sau pe card)? Trece-i aici și fiecare cheltuială scade direct din ei.
              </p>
            )}
          </Panel>

          {categories.length > 0 && (
            <Panel title="Pe categorii">
              <ul className="flex flex-col gap-3">
                {categories.map((c) => (
                  <li key={c.key}>
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span><span aria-hidden>{c.icon}</span> {c.label}</span>
                      <span className="num text-right">
                        {Object.entries(c.amounts).map(([code, v]) => fmtCur(v, code)).join(" + ")}
                        {totalMain > 0 && <span className="ml-2 text-[12px] text-ink-faint">{Math.round((c.share / totalMain) * 100)}%</span>}
                      </span>
                    </div>
                    <div className="mt-1"><Bar value={c.share} max={totalMain} color={c.color} /></div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel title="Cheltuieli" aside={<button className="btn-ghost text-[13px]" onClick={() => setExpense("nou")}>+ Adaugă</button>}>
          {expenses.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-ink-soft">
              Nicio cheltuială încă. Apasă „+ Cheltuială” și scrie suma direct în {trip.currency === "RON" ? "lei" : trip.currency}.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {byDay.map(([day, rows]) => {
                const dayTotals = sumBy(rows, (e) => e.currency, (e) => e.amount);
                return (
                  <section key={day}>
                    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line-strong pb-1">
                      <h3 className="text-[13px] font-semibold capitalize text-ink-soft">{dayLabel(day)}</h3>
                      <span className="num text-[12px] text-ink-faint">{Object.entries(dayTotals).map(([c, v]) => fmtCur(v, c)).join(" + ")}</span>
                    </div>
                    <ul>
                      {rows.map((e) => {
                        const cat = tripCategory(e.category);
                        const r = e.currency === "RON" ? null : ronRate(e.currency, funds, rates);
                        return (
                          <li key={e.id}>
                            <button className="flex w-full items-center gap-3 py-2.5 text-left hover:text-albastru" onClick={() => setExpense(e)}>
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[15px]" style={{ background: "var(--c-paper)", boxShadow: `inset 3px 0 0 ${cat.color}` }} aria-hidden>
                                {cat.icon}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px]">{e.description || cat.label}</span>
                                {e.description && <span className="block text-[12px] text-ink-faint">{cat.label}</span>}
                              </span>
                              <span className="num shrink-0 text-right">
                                <span className="block text-[14px] font-medium">{fmtCur(e.amount, e.currency)}</span>
                                {r !== null && <span className="block text-[11.5px] text-ink-faint">≈ {lei(e.amount * r)}</span>}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <p className="mt-6 text-[12px] text-ink-faint">Cheltuielile de vacanță nu intră în bugetul lunar, în panou sau în bonul lunii.</p>

      <Modal open={editingTrip} onClose={() => setEditingTrip(false)} title="Modifică vacanța">
        <TripForm
          trip={trip}
          onCancel={() => setEditingTrip(false)}
          onSaved={() => {
            setEditingTrip(false);
            done("Vacanță actualizată");
          }}
        />
      </Modal>

      <Modal open={fund !== null} onClose={() => setFund(null)} title={fund === "nou" ? "Bani pentru vacanță" : "Modifică banii"}>
        {fund !== null && (
          <FundForm
            key={fund === "nou" ? "nou" : fund.id}
            trip={trip}
            fund={fund === "nou" ? undefined : fund}
            onSaved={done}
            onDelete={fund === "nou" ? undefined : () => removeRow("trip_funds", fund.id, `${fmtCur(fund.amount, fund.currency)}${fund.label ? ` (${fund.label})` : ""}`)}
          />
        )}
      </Modal>

      <Modal open={expense !== null} onClose={() => setExpense(null)} title={expense === "nou" ? "Cheltuială nouă" : "Modifică cheltuiala"}>
        {expense !== null && (
          <TripExpenseForm
            key={expense === "nou" ? "nou" : expense.id}
            trip={trip}
            currencies={funds.map((f) => f.currency)}
            expense={expense === "nou" ? undefined : expense}
            onSaved={done}
            onDelete={expense === "nou" ? undefined : () => removeRow("trip_expenses", expense.id, `„${expense.description || tripCategory(expense.category).label}” (${fmtCur(expense.amount, expense.currency)})`)}
          />
        )}
      </Modal>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

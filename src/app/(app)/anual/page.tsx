"use client";

import { useState } from "react";
import { Bar as RBar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { YearCategory, YearReport, YearTotals } from "@/lib/analytics";
import { currentMonth, lei, monthLabel, pct } from "@/lib/util";
import { chartTooltipStyle, Empty, Money, PageHeader, Panel, Skeleton, Stat, STAT_STRIP, useApi } from "@/components/ui";

/** Schimbarea față de anul comparat, în %, cu culoarea „bine/rău” (la cheltuieli, creșterea e rea). */
function Change({ now, before, invert = false }: { now: number; before: number | undefined; invert?: boolean }) {
  if (before === undefined || Math.abs(before) < 0.01) return null;
  const d = ((now - before) / Math.abs(before)) * 100;
  if (Math.abs(d) < 0.5) return <span className="text-ink-faint">la fel</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={good ? "text-leu" : "text-rosu"}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(0)}%
    </span>
  );
}

function CategoryTable({ rows, compareYear, year, invert }: { rows: YearCategory[]; compareYear: string | null; year: string; invert: boolean }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="overflow-x-auto">
      <table className="num w-full min-w-[420px] text-[14px]">
        <thead className="text-left text-[13px] text-ink-soft">
          <tr className="border-b border-line">
            <th className="py-2 pr-3 font-medium">Categorie</th>
            <th className="py-2 pr-3 text-right font-medium">{year}</th>
            <th className="py-2 pr-3 text-right font-medium">Din total</th>
            {compareYear && <th className="py-2 pr-3 text-right font-medium">{compareYear}</th>}
            {compareYear && <th className="py-2 text-right font-medium">Schimbare</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-line/60">
              <td className="py-2 pr-3">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-xs align-middle" style={{ background: c.color }} aria-hidden />
                {c.name}
              </td>
              <td className="py-2 pr-3 text-right">{lei(c.amount)}</td>
              <td className="py-2 pr-3 text-right text-ink-soft">{total > 0 ? pct((c.amount / total) * 100, 0) : "–"}</td>
              {compareYear && <td className="py-2 pr-3 text-right text-ink-soft">{lei(c.compare)}</td>}
              {compareYear && <td className="py-2 text-right text-[13px]"><Change now={c.amount} before={c.compare} invert={invert} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Anul în cifre (beta): venituri, cheltuieli și economii lună de lună, pe categorii, comparate cu alt an.
 * Calculele sunt aceleași ca pe Panou (inclusiv ratele creditelor), doar adunate pe 12 luni.
 */
export default function YearPage() {
  const thisYear = currentMonth().slice(0, 4);
  const [year, setYear] = useState(thisYear);
  const [compare, setCompare] = useState<string>("auto");
  const compareParam = compare === "auto" ? "" : `&compare=${compare}`;
  const { data: r, error } = useApi<YearReport>(`/api/year?year=${year}${compareParam}`, [year, compare]);

  if (error && /nu există/i.test(error)) {
    return <Empty title="Pagina nu există">Raportul anual este disponibil doar în versiunea beta.</Empty>;
  }

  const step = (n: number) => {
    setYear(String(Number(year) + n));
    setCompare("auto");
  };

  const header = (
    <PageHeader
      title={`Anul ${year} în cifre`}
      intro="Tot anul pe un ecran: cât a intrat, cât a ieșit, cât ai pus deoparte și unde s-au dus banii, față de alt an."
      actions={
        <>
          <button className="btn-ghost" onClick={() => step(-1)} aria-label="Anul anterior">‹ {Number(year) - 1}</button>
          <button className="btn-ghost" onClick={() => step(1)} disabled={year >= thisYear} aria-label="Anul următor">{Number(year) + 1} ›</button>
        </>
      }
    />
  );

  if (error) return <>{header}<p className="rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu" role="alert">{error}</p></>;
  if (!r) return <>{header}<Skeleton /></>;

  const t = r.total;
  // Un an comparat fără nicio intrare (doar ratele creditelor) ar da procente fără sens.
  const c: YearTotals | undefined = r.compareTotal && r.compareTotal.monthsWithData > 0 ? r.compareTotal : undefined;
  const chart = r.months.map((m, i) => ({
    name: monthLabel(m.month, true).split(" ")[0],
    Venituri: Math.round(m.income),
    Cheltuieli: Math.round(m.spent),
    "Pus deoparte": Math.round(m.savedTotal),
    ...(r.compareMonths ? { [`Cheltuieli ${r.compareYear}`]: Math.round(r.compareMonths[i].spent) } : {}),
  }));
  const compareOptions = [...new Set([...(r.compareYear ? [r.compareYear] : []), ...r.years.filter((y) => y !== year)])];

  return (
    <>
      {header}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-[14px] text-ink-soft">
        <label htmlFor="compare">Compară cu</label>
        <select
          id="compare"
          className="field w-auto! py-1.5!"
          value={compare === "auto" ? r.compareYear ?? "none" : compare}
          onChange={(e) => setCompare(e.target.value)}
        >
          <option value="none">fără comparație</option>
          {compareOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {r.compareTotal && r.compareTotal.monthsWithData === 0 && <span className="text-[12.5px] text-ink-faint">({r.compareYear} nu are intrări)</span>}
      </div>

      {t.monthsWithData === 0 && t.spent === 0 ? (
        <Empty title={`Nicio intrare în ${year}`}>Alege alt an sau adaugă venituri și cheltuieli în Luna curentă.</Empty>
      ) : (
        <>
          <div className={`panel ${STAT_STRIP} sm:grid-cols-4`}>
            <Stat label="Venituri" accent="var(--c-leu)" hint={<Change now={t.income} before={c?.income} />}><Money value={t.income} size="lg" /></Stat>
            <Stat label="Cheltuieli" accent="var(--c-rosu)" hint={<Change now={t.spent} before={c?.spent} invert />}><Money value={t.spent} size="lg" /></Stat>
            <Stat label="Pus deoparte" accent="var(--c-galben)" hint={<Change now={t.savedTotal} before={c?.savedTotal} />}><Money value={t.savedTotal} size="lg" /></Stat>
            <Stat
              label="Rata de economisire"
              accent="var(--c-albastru)"
              hint={c && c.income > 0 ? `${r.compareYear}: ${pct(c.savingsRate, 0)}` : `${t.monthsWithData} luni cu date`}
            >
              <span className="num text-[22px] font-semibold">{pct(t.savingsRate, 0)}</span>
            </Stat>
          </div>

          <Panel className="mt-6" title="Lună de lună">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid stroke="var(--c-line)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 12 }} width={40} />
                  <Tooltip {...chartTooltipStyle} formatter={(v: number) => lei(v)} />
                  <Legend wrapperStyle={{ fontSize: 13 }} iconType="circle" iconSize={8} />
                  <RBar dataKey="Venituri" fill="var(--c-leu)" />
                  <RBar dataKey="Cheltuieli" fill="var(--c-rosu)" />
                  <RBar dataKey="Pus deoparte" fill="var(--c-galben)" />
                  {r.compareMonths && <RBar dataKey={`Cheltuieli ${r.compareYear}`} fill="var(--c-ink-faint)" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="num w-full min-w-[560px] text-[14px]">
                <thead className="text-left text-[13px] text-ink-soft">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-3 font-medium">Luna</th>
                    <th className="py-2 pr-3 text-right font-medium">Venituri</th>
                    <th className="py-2 pr-3 text-right font-medium">Cheltuieli</th>
                    <th className="py-2 pr-3 text-right font-medium">din care rate</th>
                    <th className="py-2 pr-3 text-right font-medium">Pus deoparte</th>
                    <th className="py-2 text-right font-medium">Rămas</th>
                  </tr>
                </thead>
                <tbody>
                  {r.months.map((m) => (
                    <tr key={m.month} className={`border-b border-line/60 ${m.hasData ? "" : "text-ink-faint"}`}>
                      <td className="py-2 pr-3">{monthLabel(m.month)}</td>
                      <td className="py-2 pr-3 text-right">{lei(m.income)}</td>
                      <td className="py-2 pr-3 text-right">{lei(m.spent)}</td>
                      <td className="py-2 pr-3 text-right text-ink-soft">{lei(m.loanPayments + m.loanInsurance + m.prepayFees)}</td>
                      <td className="py-2 pr-3 text-right">{lei(m.savedTotal)}</td>
                      <td className={`py-2 text-right ${m.unallocated < 0 ? "text-rosu" : ""}`}>{lei(m.unallocated)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-3">Total</td>
                    <td className="py-2 pr-3 text-right">{lei(t.income)}</td>
                    <td className="py-2 pr-3 text-right">{lei(t.spent)}</td>
                    <td className="py-2 pr-3 text-right">{lei(t.loanPayments)}</td>
                    <td className="py-2 pr-3 text-right">{lei(t.savedTotal)}</td>
                    <td className={`py-2 text-right ${t.unallocated < 0 ? "text-rosu" : ""}`}>{lei(t.unallocated)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {t.loanInterest > 0 && <p className="mt-3 text-[13px] text-ink-soft">Din ratele anului, {lei(t.loanInterest)} au fost dobândă.</p>}
          </Panel>

          <Panel className="mt-6" title="Pe ce s-au dus banii" summary={`${r.categories.length} categorii`}>
            {r.categories.length ? (
              <CategoryTable rows={r.categories} year={year} compareYear={r.compareYear} invert />
            ) : (
              <p className="text-[14px] text-ink-soft">Nicio cheltuială pe categorii în {year}. Ratele creditelor apar în tabelul de mai sus.</p>
            )}
          </Panel>

          {r.incomeCategories.length > 0 && (
            <Panel className="mt-6" title="De unde au venit banii">
              <CategoryTable rows={r.incomeCategories} year={year} compareYear={r.compareYear} invert={false} />
            </Panel>
          )}
        </>
      )}
    </>
  );
}

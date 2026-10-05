"use client";

import Link from "next/link";
import {
  Area, Bar as RBar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useEffect } from "react";
import type { Summary } from "@/lib/analytics";
import { celebrateOnce } from "@/lib/confetti";
import { currentMonth, eur, lei, monthLabel, pct } from "@/lib/util";
import { Bar, chartTooltipStyle, Delta, Empty, LEVEL_STYLE, Money, PageHeader, Panel, Skeleton, Stat, useApi, useApp } from "@/components/ui";

type S = Summary & { fxError: string | null };

const kLei = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `${Math.round(v)}`);

function LeuBand({ s }: { s: S }) {
  const t = s.totals;
  const enableInvestments = s.settings?.enable_investments === "1";
  const segments = [
    { key: "fixed", label: "Costuri fixe", value: t.fixed, color: "var(--c-albastru)" },
    { key: "loans", label: "Rate credite", value: t.loanPayments + t.loanInsurance + t.prepayFees, color: "var(--c-mov)" },
    { key: "variable", label: "Cheltuieli variabile", value: t.variable, color: "var(--c-rosu)" },
    { key: "saved", label: enableInvestments ? "Economii, investiții și rambursări" : "Economii și rambursări", value: t.savedTotal, color: "var(--c-galben)" },
    { key: "free", label: "Nealocat", value: Math.max(0, t.unallocated), color: "var(--c-leu)" },
  ].filter((x) => x.value > 0);
  const base = Math.max(t.income, t.spent + t.savedTotal);
  const over = t.unallocated < 0;

  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-ink-soft">
            Venit în {monthLabel(s.month)}
          </p>
          <Money value={t.income} rate={s.fx.rate} size="xl" />
        </div>
        <p className="max-w-md text-[15px] text-ink-soft">
          {t.income > 0 ? (
            over ? (
              <>Ai folosit cu <strong className="text-rosu">{lei(-t.unallocated)}</strong> mai mult decât ai câștigat luna aceasta.</>
            ) : (
              <>
                Din fiecare 100 lei câștigați, <strong className="text-ink">{Math.round(t.savingsRate)} lei</strong> au mers spre viitorul tău
                {t.unallocated > 0 && <> și {Math.round((t.unallocated / t.income) * 100)} lei încă așteaptă o destinație</>}.
              </>
            )
          ) : (
            "Adaugă veniturile lunii ca să vezi unde merge fiecare leu."
          )}
        </p>
      </div>

      <div className="mt-5 flex h-14 w-full overflow-hidden rounded-[6px] bg-line/60" role="img" aria-label="Distribuția venitului">
        {segments.map((seg, i) => (
          <div
            key={seg.key}
            className="band-grow h-full"
            style={{
              width: `${(seg.value / base) * 100}%`,
              background: seg.key === "free" ? `repeating-linear-gradient(135deg, ${seg.color} 0 6px, var(--c-leu-soft) 6px 12px)` : seg.color,
              animationDelay: `${i * 90}ms`,
              borderRight: "2px solid var(--c-paper)",
            }}
            title={`${seg.label}: ${lei(seg.value)}`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-start gap-2 text-[13px]">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: seg.color }} />
            <div>
              <div className="text-ink-soft">{seg.label}</div>
              <div className="num font-medium">
                {lei(seg.value)} <span className="text-ink-faint">· {pct(t.income ? (seg.value / t.income) * 100 : 0, 0)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { month } = useApp();
  const { data: s, error } = useApi<S>(`/api/summary?month=${month}`);

  // Luna trecută s-a încheiat pe plus → confetti, o singură dată pe lună.
  useEffect(() => {
    if (s && month === currentMonth() && s.prev?.hasData && s.prev.unallocated > 0) celebrateOnce(`luna-plus:${s.prev.month}`);
  }, [s, month]);

  if (error) return <Empty title="Panoul nu s-a putut încărca">{error}</Empty>;
  if (!s) return <Skeleton />;

  const t = s.totals;
  const debt = s.loans.reduce((a, l) => a + l.status.balance, 0);
  const nw = s.netWorth[s.netWorth.length - 1];
  const nwPrev = s.netWorth[s.netWorth.length - 2];
  const nothing = !s.trend.some((x) => x.hasData) && s.loans.length === 0 && s.goals.length === 0;

  if (nothing) {
    return (
      <>
        <PageHeader title="Bun venit" intro="Aplicația e goală. În patru pași ai prima imagine completă a banilor tăi." />
        <ol className="grid gap-4 md:grid-cols-2">
          {[
            ["Adaugă creditul ipotecar", "Suma, perioada, dobânda fixă și marja + IRCC pentru perioada variabilă.", "/credite", "var(--c-mov)"],
            ["Completează luna curentă", "Venituri, costuri fixe și cheltuieli. Ratele creditelor apar automat.", "/luna", "var(--c-leu)"],
            ["Creează fondul de urgență", "Aplicația îți calculează ținta din cheltuielile esențiale.", "/economii", "var(--c-galben)"],
            ["Revino lunar", "Marchează intrările recurente și copiază-le cu un clic în luna următoare.", "/luna", "var(--c-albastru)"],
          ].map(([title, text, href, color], i) => (
            <li key={title} className="panel p-5">
              <div className="font-display text-[32px] font-bold leading-none" style={{ color }}>{i + 1}</div>
              <h2 className="mt-2 text-[18px] font-semibold">{title}</h2>
              <p className="mt-1 text-ink-soft">{text}</p>
              <Link href={href} className="btn-primary mt-4">Deschide</Link>
            </li>
          ))}
        </ol>
      </>
    );
  }

  const trendData = s.trend.map((x) => ({
    luna: monthLabel(x.month, true),
    Venit: Math.round(x.income),
    Cheltuit: Math.round(x.spent),
    Economisit: Math.round(x.savedTotal),
    rata: x.hasData ? Number(x.savingsRate.toFixed(1)) : null,
  }));

  const pieData = s.categories.filter((c) => c.amount > 0);
  const nwData = s.netWorth.map((x) => ({
    luna: monthLabel(x.month, true),
    Active: Math.round(x.assets),
    Datorii: -Math.round(x.debt),
    "Avere netă": Math.round(x.net),
  }));

  return (
    <>
      {s.fxError && (
        <p className="mb-4 rounded-md bg-galben-tint px-3 py-2 text-[13px]">
          Cursul BNR nu a putut fi actualizat ({s.fxError}). Sumele în euro folosesc ultimul curs salvat.
        </p>
      )}

      <LeuBand s={s} />

      {/* Simulator rapid de decizie achiziții */}
      <div className="mb-6 rounded-xl border border-albastru/30 bg-gradient-to-r from-albastru-tint/50 via-mov-tint/30 to-paper p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-[30px]">🎯</span>
            <div>
              <h3 className="font-semibold text-[16px] text-ink">
                Urmează o investiție sau o achiziție dorită?
              </h3>
              <p className="text-[13px] text-ink-soft">
                Testează plata integrală vs credit și află instant dacă ți-o permiți și cum îți schimbă venitul lunar.
              </p>
            </div>
          </div>
          <Link href="/achizitii" className="btn-primary shrink-0 py-2 px-4 text-[13px]">
            Verifică dacă îți permiți ›
          </Link>
        </div>
      </div>

      <div className="panel mb-6 grid grid-cols-2 gap-6 p-5 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Cheltuit" accent="var(--c-rosu)" hint={<Delta now={t.spent} before={s.prev?.spent} invert />}>
          <Money value={t.spent} rate={s.fx.rate} size="lg" />
        </Stat>
        <Stat label="Pus deoparte" accent="var(--c-galben)" hint={`${pct(t.savingsRate)} din venit`}>
          <Money value={t.savedTotal} rate={s.fx.rate} size="lg" />
        </Stat>
        <Stat label="Rate / venit" accent="var(--c-mov)" hint={t.dti > 40 ? "Peste pragul BNR de 40%" : "Pragul BNR este 40%"}>
          <span className={`num font-display text-[26px] font-semibold ${t.dti > 40 ? "text-rosu" : ""}`}>{pct(t.dti)}</span>
        </Stat>
        <Stat label="Datorii rămase" accent="var(--c-mov)" hint={s.loans.length ? `${s.loans.length} ${s.loans.length === 1 ? "credit" : "credite"}` : "Niciun credit"}>
          <Money value={debt} rate={s.fx.rate} size="lg" />
        </Stat>
        <Stat label="Avere netă" accent="var(--c-leu)" hint={<Delta now={nw.net} before={nwPrev?.net} />}>
          <Money value={nw.net} rate={s.fx.rate} size="lg" tone={nw.net < 0 ? "rosu" : undefined} />
        </Stat>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Ultimele 12 luni">
          <div className="h-[300px]">
            <ResponsiveContainer>
              <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="var(--c-line)" vertical={false} />
                <XAxis dataKey="luna" tick={{ fontSize: 12, fill: "var(--c-ink-soft)" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tickFormatter={kLei} tick={{ fontSize: 12, fill: "var(--c-ink-soft)" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="r" orientation="right" unit="%" tick={{ fontSize: 12, fill: "var(--c-ink-faint)" }} axisLine={false} tickLine={false} />
                <Tooltip {...chartTooltipStyle} formatter={(v: number, n: string) => (n === "Rata de economisire" ? `${v}%` : lei(v))} />
                <Legend wrapperStyle={{ fontSize: 13 }} iconType="circle" iconSize={8} />
                <RBar yAxisId="l" dataKey="Venit" fill="var(--c-leu)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <RBar yAxisId="l" dataKey="Cheltuit" fill="var(--c-rosu)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <RBar yAxisId="l" dataKey="Economisit" fill="var(--c-galben)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line yAxisId="r" dataKey="rata" name="Rata de economisire" stroke="var(--c-ink)" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Ce să faci luna aceasta" aside={<Link href="/buget" className="text-[13px] text-albastru hover:underline">Metode de buget</Link>}>
          <ul className="flex max-h-[300px] flex-col gap-3 overflow-y-auto pr-1">
            {s.suggestions.map((sg, i) => {
              const st = LEVEL_STYLE[sg.level];
              return (
                <li key={i} className="rounded-md border-l-[3px] py-1 pl-3" style={{ borderColor: st.color }}>
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 rounded px-1.5 text-[11px] font-medium" style={{ background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                    <span className="font-medium leading-snug">{sg.title}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-soft">{sg.text}</p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Pe ce s-au dus banii">
          {pieData.length === 0 ? (
            <Empty title="Nicio cheltuială luna aceasta">
              <Link href="/luna" className="text-albastru hover:underline">Adaugă cheltuieli</Link>
            </Empty>
          ) : (
            <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
              <div className="h-[200px]">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="amount" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={1.5} stroke="none">
                      {pieData.map((c) => <Cell key={c.id} fill={c.color} />)}
                    </Pie>
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => lei(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex flex-col gap-2 text-[14px]">
                {s.categories.slice(0, 8).map((c) => {
                  const diff = c.avg3 > 0 ? ((c.amount - c.avg3) / c.avg3) * 100 : null;
                  return (
                    <li key={c.id}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
                          {c.name}
                        </span>
                        <span className="num font-medium">{lei(c.amount)}</span>
                      </div>
                      {diff !== null && Math.abs(diff) >= 10 && (
                        <div className={`ml-[18px] text-[12px] ${diff > 0 ? "text-rosu" : "text-leu"}`}>
                          {diff > 0 ? "+" : ""}{diff.toFixed(0)}% față de media de {lei(c.avg3)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Avere netă">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <ComposedChart data={nwData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} stackOffset="sign">
                <CartesianGrid stroke="var(--c-line)" vertical={false} />
                <XAxis dataKey="luna" tick={{ fontSize: 12, fill: "var(--c-ink-soft)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={kLei} tick={{ fontSize: 12, fill: "var(--c-ink-soft)" }} axisLine={false} tickLine={false} />
                <Tooltip {...chartTooltipStyle} formatter={(v: number) => lei(v)} />
                <Legend wrapperStyle={{ fontSize: 13 }} iconType="circle" iconSize={8} />
                <Area dataKey="Active" stroke="var(--c-galben)" fill="var(--c-galben-tint)" strokeWidth={2} />
                <Area dataKey="Datorii" stroke="var(--c-mov)" fill="var(--c-mov-tint)" strokeWidth={2} />
                <Line dataKey="Avere netă" stroke="var(--c-ink)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[13px] text-ink-soft">
            Active: {lei(nw.assets)} ({eur(nw.assets / s.fx.rate)}). Datorii: {lei(nw.debt)}.
          </p>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Credite" aside={<Link href="/credite" className="text-[13px] text-albastru hover:underline">Toate creditele</Link>}>
          {s.loans.length === 0 ? (
            <p className="text-ink-soft">Niciun credit adăugat.</p>
          ) : (
            <ul className="flex flex-col gap-5">
              {s.loans.map((l) => (
                <li key={l.loan.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/credite/${l.loan.id}`} className="font-medium hover:underline">{l.loan.name}</Link>
                    <span className="num text-[13px] text-ink-soft">
                      {pct(l.status.currentRate, 2)} {l.status.inFixed ? `fixă încă ${l.status.monthsToVariable} luni` : "variabilă"}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Bar value={l.status.paidPct} color="var(--c-mov)" />
                  </div>
                  <div className="num mt-1.5 flex flex-wrap justify-between gap-2 text-[13px] text-ink-soft">
                    <span>Rămas {lei(l.status.balance)} · {pct(l.status.paidPct, 0)} achitat</span>
                    <span>Final: {monthLabel(l.status.payoffMonth)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Obiective" aside={<Link href="/economii" className="text-[13px] text-albastru hover:underline">Economii</Link>}>
          {s.goals.length === 0 ? (
            <p className="text-ink-soft">Niciun obiectiv încă. Începe cu fondul de urgență.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {s.goals.map((g) => (
                <li key={g.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{g.name}</span>
                    <span className="num text-[13px] text-ink-soft">{lei(g.saved)} din {lei(g.target)}</span>
                  </div>
                  <div className="mt-2"><Bar value={g.pct} color={g.color} /></div>
                  <div className="mt-1 text-[12px] text-ink-soft">
                    {g.pct >= 100 ? "Atins" : g.eta ? <>Estimat în {monthLabel(g.eta)} la ritmul actual</> : "Fără contribuții recente"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

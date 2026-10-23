"use client";

import Link from "next/link";
import {
  Area, Bar as RBar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useEffect, useState } from "react";
import type { Summary } from "@/lib/analytics";
import { celebrateOnce } from "@/lib/confetti";
import { currentMonth, eur, lei, monthLabel, pct, r2 } from "@/lib/util";
import { ReceiptMeta } from "@/components/receipt";
import ActiveTripCard from "@/components/ActiveTripCard";
import { Bar, chartTooltipStyle, Delta, Empty, LEVEL_STYLE, Money, PageHeader, Panel, Ring, Skeleton, Stat, STAT_STRIP, Tabs, useApi, useApp, useTab } from "@/components/ui";

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
    <section className="mb-6 sm:mb-10" data-tour="band">
      <ReceiptMeta month={s.month} label={monthLabel(s.month, true)} />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          {s.profile.firstName && <p className="mb-1 font-display text-[17px] font-semibold text-ink">Bună, {s.profile.firstName}!</p>}
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

      <div className="mt-4 flex h-10 sm:mt-5 sm:h-14 w-full overflow-hidden rounded-[6px] bg-line/60" role="img" aria-label="Distribuția venitului">
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
      {/* Telefon: o listă scurtă, un rând pe segment. Ecran mare: legenda pe coloane, sub bandă. */}
      <ul className="mt-3 flex flex-col gap-1 sm:hidden">
        {segments.map((seg) => (
          <li key={seg.key} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: seg.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{seg.label}</span>
            <span className="num font-medium">{lei(seg.value)}</span>
            <span className="num w-9 text-right text-ink-faint">{pct(t.income ? (seg.value / t.income) * 100 : 0, 0)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 hidden gap-x-6 gap-y-2 sm:grid sm:grid-cols-3 lg:grid-cols-5">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-start gap-2 text-[13px]">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: seg.color }} />
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
  const [tab, setTab] = useTab<DashTab>("panou", "luna", ["luna", "evolutie", "obiective"]);
  const [trendView, setTrendView] = useState<"sume" | "rata">("sume");

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
    Venit: r2(x.income),
    Cheltuit: r2(x.spent),
    Economisit: r2(x.savedTotal),
    rata: x.hasData ? Number(x.savingsRate.toFixed(1)) : null,
  }));

  const pieData = s.categories.filter((c) => c.amount > 0);
  const nwData = s.netWorth.map((x) => ({
    luna: monthLabel(x.month, true),
    Active: r2(x.assets),
    Datorii: -Math.round(x.debt),
    "Avere netă": r2(x.net),
  }));

  return (
    <>
      {s.fxError && (
        <p className="mb-4 rounded-md bg-galben-tint px-3 py-2 text-[13px]">
          Cursul BNR nu a putut fi actualizat ({s.fxError}). Sumele în euro folosesc ultimul curs salvat.
        </p>
      )}

      <LeuBand s={s} />

      <ActiveTripCard />

      {/* Pe telefon cifrele cheie stau pe un singur rând care se derulează lateral, nu pe trei rânduri. */}
      <div
        className={`panel mb-6 xl:grid-cols-5 ${STAT_STRIP}`}
        data-tour="stats"
      >
        <Stat label="Cheltuit" accent="var(--c-rosu)" hint={<Delta now={t.spent} before={s.prev?.spent} invert />}>
          <Money value={t.spent} rate={s.fx.rate} size="lg" />
        </Stat>
        <Stat label="Pus deoparte" accent="var(--c-galben)" hint={`${pct(t.savingsRate)} din venit`}>
          <Money value={t.savedTotal} rate={s.fx.rate} size="lg" />
        </Stat>
        <Stat label="Rate / venit" accent="var(--c-mov)" hint={t.dti > 40 ? "Peste pragul BNR de 40%" : "Pragul BNR este 40%"}>
          <span className={`num font-display text-[22px] font-semibold sm:text-[26px] ${t.dti > 40 ? "text-rosu" : ""}`}>{pct(t.dti)}</span>
          {/* Bara arată cât din pragul BNR (linia neagră, 40%) e folosit. */}
          <div className="mt-1.5 max-w-[160px]">
            <Bar value={t.dti} max={60} marker={40} color={t.dti > 40 ? "var(--c-rosu)" : "var(--c-mov)"} />
          </div>
        </Stat>
        <Stat label="Datorii rămase" accent="var(--c-mov)" hint={s.loans.length ? `${s.loans.length} ${s.loans.length === 1 ? "credit" : "credite"}` : "Niciun credit"}>
          <Money value={debt} rate={s.fx.rate} size="lg" />
        </Stat>
        <Stat label="Avere netă" accent="var(--c-leu)" hint={<Delta now={nw.net} before={nwPrev?.net} />}>
          <Money value={nw.net} rate={s.fx.rate} size="lg" tone={nw.net < 0 ? "rosu" : undefined} />
        </Stat>
      </div>

      <Tabs tabs={DASH_TABS} value={tab} onChange={setTab} className="mb-5" label="Secțiunile panoului" data-tour="dash-tabs" />

      {tab === "luna" && (
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <Panel title="Pe ce s-au dus banii" aside={pieData.length > 0 ? <span className="num text-[13px] text-ink-soft">{lei(t.spent)}</span> : undefined}>
            {pieData.length === 0 ? (
              <Empty title="Nicio cheltuială luna aceasta">
                <Link href="/luna" className="text-albastru hover:underline">Adaugă cheltuieli</Link>
              </Empty>
            ) : (
              <CategoryBreakdown categories={pieData} />
            )}
          </Panel>

          <div className="flex flex-col gap-6">
            <Panel title="Ce să faci luna aceasta" aside={<Link href="/buget" className="text-[13px] text-albastru hover:underline">Metode de buget</Link>}>
              <Suggestions items={s.suggestions} />
            </Panel>

            {/* Simulatorul de achiziții, ca un cupon decupat, dar pe un singur rând. */}
            <Link
              href="/achizitii"
              className="group flex items-center gap-3 rounded-[4px] border-2 border-dashed border-line-strong bg-sheet/50 px-4 py-3 transition-colors hover:border-ink-faint"
            >
              <span className="text-[24px]" aria-hidden>🎯</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">Îți dorești ceva mai scump?</span>
                <span className="block text-[12.5px] text-ink-soft">Află dacă îți permiți: plată integrală sau credit.</span>
              </span>
              <span className="shrink-0 text-[18px] text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden>›</span>
            </Link>
          </div>
        </div>
      )}

      {tab === "evolutie" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Ultimele 12 luni"
            aside={
              <Tabs
                tabs={[{ key: "sume", label: "Sume" }, { key: "rata", label: "Rata de economisire" }] as const}
                value={trendView}
                onChange={setTrendView}
                label="Ce arată graficul"
                className="p-0.5! [&_button]:min-h-[30px] [&_button]:px-2.5 [&_button]:text-[12px]"
              />
            }
          >
            <div className="h-[280px]">
              <ResponsiveContainer>
                {trendView === "sume" ? (
                  <ComposedChart data={trendData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--c-line)" vertical={false} />
                    <XAxis dataKey="luna" tick={{ fontSize: 12, fill: "var(--c-ink-soft)" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={kLei} tick={{ fontSize: 12, fill: "var(--c-ink-soft)" }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => lei(v)} />
                    <Legend wrapperStyle={{ fontSize: 13 }} iconType="circle" iconSize={8} />
                    <RBar dataKey="Venit" fill="var(--c-leu)" radius={[3, 3, 0, 0]} maxBarSize={16} />
                    <RBar dataKey="Cheltuit" fill="var(--c-rosu)" radius={[3, 3, 0, 0]} maxBarSize={16} />
                    <RBar dataKey="Economisit" fill="var(--c-galben)" radius={[3, 3, 0, 0]} maxBarSize={16} />
                  </ComposedChart>
                ) : (
                  <ComposedChart data={trendData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--c-line)" vertical={false} />
                    <XAxis dataKey="luna" tick={{ fontSize: 12, fill: "var(--c-ink-soft)" }} axisLine={false} tickLine={false} />
                    <YAxis unit="%" tick={{ fontSize: 12, fill: "var(--c-ink-soft)" }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => `${v}%`} />
                    <ReferenceLine y={20} stroke="var(--c-leu)" strokeDasharray="4 4" label={{ value: "țintă 20%", position: "insideTopRight", fontSize: 11, fill: "var(--c-leu)" }} />
                    <Area dataKey="rata" name="Rata de economisire" stroke="var(--c-galben)" fill="var(--c-galben-tint)" strokeWidth={2} connectNulls dot={{ r: 2.5 }} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Avere netă" aside={<span className="num text-[13px] text-ink-soft" title={`Active ${eur(nw.assets / s.fx.rate)}`}>Active {lei(nw.assets)} · Datorii {lei(nw.debt)}</span>}>
            <div className="h-[280px]">
              <ResponsiveContainer>
                <ComposedChart data={nwData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} stackOffset="sign">
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
          </Panel>
        </div>
      )}

      {tab === "obiective" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Obiective" aside={<Link href="/economii" className="text-[13px] text-albastru hover:underline">Economii</Link>}>
            {s.goals.length === 0 ? (
              <p className="text-ink-soft">Niciun obiectiv încă. Începe cu fondul de urgență.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {s.goals.map((g) => (
                  <li key={g.id} className="flex items-center gap-3">
                    <Ring value={g.pct} color={g.color} />
                    <div className="min-w-0">
                      <div className="font-medium leading-snug">{g.name}</div>
                      <div className="num text-[12.5px] text-ink-soft">{lei(g.saved)} din {lei(g.target)}</div>
                      <div className="text-[12px] text-ink-faint">
                        {g.pct >= 100 ? "Atins 🎉" : g.eta ? <>Estimat: {monthLabel(g.eta)}</> : "Fără contribuții recente"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Credite" aside={<Link href="/credite" className="text-[13px] text-albastru hover:underline">Toate creditele</Link>}>
            {s.loans.length === 0 ? (
              <p className="text-ink-soft">Niciun credit adăugat.</p>
            ) : (
              <ul className="flex flex-col gap-5">
                {s.loans.map((l) => (
                  <li key={l.loan.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/credite/${l.loan.id}`} className="font-medium hover:underline">{l.loan.name}</Link>
                      <span className="num text-[13px] text-ink-soft">{pct(l.status.paidPct, 0)} achitat</span>
                    </div>
                    <div className="mt-2">
                      <Bar value={l.status.paidPct} color="var(--c-mov)" />
                    </div>
                    <div className="num mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[12.5px] text-ink-soft">
                      <span>Rămas {lei(l.status.balance)}</span>
                      <span title={l.status.inFixed ? `Dobândă fixă încă ${l.status.monthsToVariable} luni` : "Dobândă variabilă"}>
                        {pct(l.status.currentRate, 2)} {l.status.inFixed ? "fixă" : "variabilă"} · final {monthLabel(l.status.payoffMonth, true)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

const DASH_TABS = [
  { key: "luna", label: "Luna aceasta", short: "Luna" },
  { key: "evolutie", label: "Evoluție" },
  { key: "obiective", label: "Obiective și credite", short: "Obiective" },
] as const;
type DashTab = (typeof DASH_TABS)[number]["key"];

type Cat = Summary["categories"][number];

/** Unde s-au dus banii: inelul pe categorii, apoi cele mai mari categorii ca bare (restul la cerere). */
function CategoryBreakdown({ categories }: { categories: Cat[] }) {
  const [all, setAll] = useState(false);
  const max = Math.max(...categories.map((c) => c.amount));
  const shown = all ? categories : categories.slice(0, 5);
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[170px_1fr]">
      <div className="mx-auto h-[140px] w-[140px] sm:h-[170px] sm:w-[170px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={categories} dataKey="amount" nameKey="name" innerRadius="62%" outerRadius="98%" paddingAngle={1.5} stroke="none">
              {categories.map((c) => <Cell key={c.id} fill={c.color} />)}
            </Pie>
            <Tooltip {...chartTooltipStyle} formatter={(v: number) => lei(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div>
        <ul className="flex flex-col gap-2.5">
          {shown.map((c) => {
            const diff = c.avg3 > 0 ? ((c.amount - c.avg3) / c.avg3) * 100 : null;
            return (
              <li key={c.id}>
                <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="num shrink-0">
                    {diff !== null && Math.abs(diff) >= 10 && (
                      <span className={`mr-1.5 text-[11.5px] ${diff > 0 ? "text-rosu" : "text-leu"}`} title={`Media ultimelor 3 luni: ${lei(c.avg3)}`}>
                        {diff > 0 ? "▲" : "▼"}{Math.abs(diff).toFixed(0)}%
                      </span>
                    )}
                    {lei(c.amount)}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={c.amount} max={max} color={c.color} />
                </div>
              </li>
            );
          })}
        </ul>
        {categories.length > 5 && (
          <button className="mt-3 text-[13px] font-medium text-albastru hover:underline" onClick={() => setAll(!all)}>
            {all ? "Arată mai puțin" : `Arată toate (${categories.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Recomandările lunii: se vede doar titlul; explicația se deschide la atingere. */
function Suggestions({ items }: { items: Summary["suggestions"] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 3);
  return (
    <>
      <ul className="flex flex-col gap-2">
        {shown.map((sg, i) => {
          const st = LEVEL_STYLE[sg.level];
          return (
            <li key={i}>
              <details className="group rounded-md border-l-[3px] bg-paper/40 py-1.5 pl-3 pr-2" style={{ borderColor: st.color }}>
                <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
                  <span className="mt-0.5 shrink-0 rounded-sm px-1.5 text-[11px] font-medium" style={{ background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                  <span className="min-w-0 flex-1 text-[14px] font-medium leading-snug">{sg.title}</span>
                  <span className="mt-0.5 shrink-0 text-ink-faint transition-transform group-open:rotate-90" aria-hidden>›</span>
                </summary>
                <p className="mt-1 text-[13px] text-ink-soft">{sg.text}</p>
              </details>
            </li>
          );
        })}
      </ul>
      {items.length > 3 && (
        <button className="mt-3 text-[13px] font-medium text-albastru hover:underline" onClick={() => setAll(!all)}>
          {all ? "Arată mai puțin" : `Toate recomandările (${items.length})`}
        </button>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  Area, AreaChart, Bar as RBar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { MethodView, Summary } from "@/lib/analytics";
import { BUCKET_LABEL, lei, monthLabel, pct, type Bucket } from "@/lib/util";
import { api, chartTooltipStyle, Empty, Field, PageHeader, Panel, Skeleton, Toast, useApi, useApp } from "@/components/ui";

const BUCKETS: Bucket[] = ["needs", "wants", "savings"];
const BUCKET_COLOR: Record<Bucket, string> = { needs: "var(--c-albastru)", wants: "var(--c-rosu)", savings: "var(--c-galben)" };
const METHOD_COLOR: Record<string, string> = { "503020": "var(--c-leu)", custom: "var(--c-mov)", zero: "var(--c-ink-faint)", smart: "var(--c-ink)" };

function scoreWord(score: number) {
  if (score >= 90) return "Foarte aproape";
  if (score >= 70) return "Aproape";
  if (score >= 45) return "Abateri moderate";
  return "Departe de țintă";
}

function MethodCard({ m, income, best }: { m: MethodView; income: number; best: boolean }) {
  return (
    <div className={`panel flex flex-col p-5 ${best ? "outline outline-2 outline-ink" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[20px] font-semibold">{m.name}</h3>
          <p className="mt-0.5 text-[13px] text-ink-soft">{m.description}</p>
        </div>
        <div className="text-right">
          <div className="num font-display text-[34px] font-bold leading-none" style={{ color: METHOD_COLOR[m.key] }}>{m.score}</div>
          <div className="text-[11px] text-ink-soft">{scoreWord(m.score)}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {BUCKETS.map((b) => {
          const actual = m.actual[b];
          const target = m.targets[b];
          const diff = actual - target;
          const good = b === "savings" ? diff >= -1 : diff <= 1;
          const max = Math.max(actual, target, 1) * 1.1;
          return (
            <div key={b}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="font-medium">{BUCKET_LABEL[b]}</span>
                <span className="num text-ink-soft">
                  {pct(income ? (actual / income) * 100 : 0, 0)} din {pct(m.targetPct[b], 0)} țintă
                </span>
              </div>
              <div className="relative mt-1.5 h-3 rounded-full bg-line/70">
                <div className="h-3 rounded-full" style={{ width: `${(actual / max) * 100}%`, background: BUCKET_COLOR[b] }} />
                <span className="absolute -top-1 h-5 w-[2px] bg-ink" style={{ left: `${(target / max) * 100}%` }} aria-hidden />
              </div>
              <div className={`num mt-1 text-[12px] ${good ? "text-leu" : "text-rosu"}`}>
                {Math.abs(diff) < 1
                  ? "exact la țintă"
                  : b === "savings"
                    ? diff > 0 ? `${lei(diff)} peste țintă` : `mai pune deoparte ${lei(-diff)}`
                    : diff > 0 ? `redu cu ${lei(diff)}` : `${lei(-diff)} sub limită`}
              </div>
            </div>
          );
        })}
      </div>

      {m.notes.length > 0 && (
        <ul className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4 text-[13px] text-ink-soft">
          {m.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function BudgetPage() {
  const { month, bump } = useApp();
  const { data: s, reload } = useApi<Summary>(`/api/summary?month=${month}`);
  const [custom, setCustom] = useState({ needs: "50", wants: "25", savings: "25" });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (s) setCustom({ needs: s.settings.custom_needs, wants: s.settings.custom_wants, savings: s.settings.custom_savings });
  }, [s]);

  if (!s) return <Skeleton />;
  const t = s.totals;

  const sum = Number(custom.needs) + Number(custom.wants) + Number(custom.savings);
  const saveCustom = async () => {
    await api("/api/settings", "PUT", { custom_needs: custom.needs, custom_wants: custom.wants, custom_savings: custom.savings });
    reload();
    bump();
    setToast("Procentele tale au fost salvate");
  };

  const best = [...s.methods].sort((a, b) => b.score - a.score)[0];
  const compareData = BUCKETS.map((b) => {
    const row: Record<string, string | number> = { grup: BUCKET_LABEL[b], "Situația ta": Math.round(t[b === "savings" ? "savedTotal" : b]) };
    for (const m of s.methods) row[m.name] = Math.round(m.targets[b]);
    return row;
  });

  const trendData = s.trend
    .filter((x) => x.hasData && x.income > 0)
    .map((x) => ({
      luna: monthLabel(x.month, true),
      Nevoi: Number(((x.needs / x.income) * 100).toFixed(1)),
      Dorințe: Number(((x.wants / x.income) * 100).toFixed(1)),
      Economii: Number(((x.savedTotal / x.income) * 100).toFixed(1)),
    }));

  return (
    <>
      <PageHeader
        title="Metode de buget"
        intro={
          <>
            Aceeași lună, văzută prin patru reguli diferite. Nevoile includ ratele creditelor; economiile includ plățile anticipate.
            Ce e nevoie și ce e dorință setezi pe fiecare categorie, în Setări.
          </>
        }
      />

      {t.income <= 0 ? (
        <Empty title={`Nu există venituri în ${monthLabel(month)}`}>Metodele se calculează ca procent din venit. Adaugă veniturile în Luna curentă.</Empty>
      ) : (
        <>
          <p className="mb-5 text-[15px]">
            Luna aceasta te potrivești cel mai bine cu <strong>{best.name}</strong> (scor {best.score} din 100).
          </p>
          <div className="mb-6 grid gap-6 md:grid-cols-2">
            {s.methods.map((m) => <MethodCard key={m.key} m={m} income={t.income} best={m.key === best.key} />)}
          </div>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <Panel title="Ținte în lei, comparate cu situația ta">
              <div className="h-[300px]">
                <ResponsiveContainer>
                  <BarChart data={compareData} margin={{ top: 6, right: 8, left: -4, bottom: 0 }}>
                    <CartesianGrid stroke="var(--c-line)" vertical={false} />
                    <XAxis dataKey="grup" tick={{ fontSize: 13 }} />
                    <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => lei(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                    <RBar dataKey="Situația ta" fill="var(--c-galben)" radius={[3, 3, 0, 0]} />
                    {s.methods.map((m) => (
                      <RBar key={m.key} dataKey={m.name} fill={METHOD_COLOR[m.key]} fillOpacity={0.75} radius={[3, 3, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Cum s-a împărțit venitul în ultimele luni">
              {trendData.length < 2 ? (
                <p className="text-ink-soft">Graficul apare după ce ai cel puțin două luni cu venituri.</p>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer>
                    <AreaChart data={trendData} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke="var(--c-line)" vertical={false} />
                      <XAxis dataKey="luna" tick={{ fontSize: 12 }} />
                      <YAxis unit="%" tick={{ fontSize: 12 }} />
                      <Tooltip {...chartTooltipStyle} formatter={(v: number) => `${v}%`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                      <Area dataKey="Nevoi" stackId="1" stroke="var(--c-albastru)" fill="var(--c-albastru)" fillOpacity={0.8} />
                      <Area dataKey="Dorințe" stackId="1" stroke="var(--c-rosu)" fill="var(--c-rosu)" fillOpacity={0.8} />
                      <Area dataKey="Economii" stackId="1" stroke="var(--c-galben)" fill="var(--c-galben)" fillOpacity={0.8} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      <Panel title="Procentele tale">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (sum === 100) saveCustom();
          }}
        >
          {BUCKETS.map((b) => (
            <div key={b} className="w-32">
              <Field label={`${BUCKET_LABEL[b]} (%)`}>
                <input className="field num" type="number" min={0} max={100} value={custom[b]} onChange={(e) => setCustom({ ...custom, [b]: e.target.value })} />
              </Field>
            </div>
          ))}
          <button className="btn-primary" type="submit" disabled={sum !== 100}>Salvează procentele</button>
          <span className={`pb-2 text-[13px] ${sum === 100 ? "text-ink-soft" : "text-rosu"}`}>
            Total {sum}%{sum !== 100 && ". Suma trebuie să fie 100%."}
          </span>
        </form>
      </Panel>
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

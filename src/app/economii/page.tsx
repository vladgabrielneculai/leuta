"use client";

import { useEffect, useMemo, useState } from "react";
import { celebrateOnce } from "@/lib/confetti";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GoalView, InvestmentView, Summary } from "@/lib/analytics";
import { lei, monthLabel, pct, r2 } from "@/lib/util";
import { api, Bar, chartTooltipStyle, Empty, Field, Modal, Money, PageHeader, Panel, Skeleton, Stat, Toast, useApi, useApp } from "@/components/ui";

const GOAL_COLORS = ["#C99A1E", "#3D7A4E", "#2E5C8A", "#B5456A", "#6A4E99"];

type GoalDraft = { id?: number; name: string; type: "emergency" | "goal"; target: string; initial: string; deadline: string; color: string };
type InvDraft = { id?: number; name: string; type: string; expected_return: string };

function EmergencyGauge({ s }: { s: Summary }) {
  const e = s.emergency;
  const segments = Array.from({ length: e.months }, (_, i) => Math.max(0, Math.min(1, e.monthsCovered - i)));
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] text-ink-soft">Acoperire</div>
          <div className="num font-display text-[44px] font-semibold leading-none">
            {e.monthsCovered.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}
            <span className="text-[20px] text-ink-soft"> din {e.months} luni</span>
          </div>
        </div>
        <div className="text-right">
          <Money value={e.saved} rate={s.fx.rate} size="lg" tone="galben" />
          <div className="text-[13px] text-ink-soft">din {lei(e.target)}</div>
        </div>
      </div>
      <div className="mt-5 flex gap-1.5" role="img" aria-label={`${e.monthsCovered.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} luni acoperite din ${e.months}`}>
        {segments.map((f, i) => (
          <div key={i} className="h-10 flex-1 overflow-hidden rounded-[4px] bg-line/70">
            <div className="h-full bg-galben" style={{ width: `${f * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-ink-faint">
        <span>1 lună</span>
        <span className={e.monthsCovered >= 3 ? "text-leu" : ""}>minim recomandat: 3 luni</span>
        <span>{e.months} luni</span>
      </div>
      <p className="mt-4 text-[14px] text-ink-soft">
        {e.avgEssential > 0
          ? <>
              O lună de nevoi esențiale te costă în medie {lei(e.avgEssential)} (inclusiv ratele). Ținta se actualizează automat dacă nu ai setat o sumă fixă.
              {e.fromProfile && <> Cele {e.months} luni vin din profilul tău: {e.reasons.join(", ")}.</>}
            </>
          : "Adaugă cheltuieli în Luna curentă ca să calculez ținta din nevoile tale esențiale."}
      </p>
    </div>
  );
}

function projection(start: number, monthly: number, annual: number, years: number) {
  const r = annual / 100 / 12;
  const out = [];
  let v = start;
  let contributed = start;
  for (let m = 0; m <= years * 12; m++) {
    if (m % 12 === 0) out.push({ an: `Anul ${m / 12}`, Contribuții: Math.round(contributed), Valoare: Math.round(v) });
    v = v * (1 + r) + monthly;
    contributed += monthly;
  }
  return out;
}

export default function SavingsPage() {
  const { month, bump } = useApp();
  const { data: s, reload } = useApi<Summary>(`/api/summary?month=${month}`);
  const [goal, setGoal] = useState<GoalDraft | null>(null);

  // Obiectiv atins (100%) → confetti, o singură dată pentru fiecare obiectiv.
  useEffect(() => {
    for (const g of s?.goals ?? []) if (g.pct >= 100 && g.target > 0) celebrateOnce(`obiectiv:${g.id}:${g.target}`);
  }, [s]);
  const [inv, setInv] = useState<InvDraft | null>(null);
  const [valueFor, setValueFor] = useState<{ inv: InvestmentView; value: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [proj, setProj] = useState<{ monthly: string; years: string; rate: string } | null>(null);

  const done = (msg: string) => {
    reload();
    bump();
    setToast(msg);
  };

  const { inflationRate, confirm } = useApp();
  const invested = s?.investments.reduce((a, i) => a + i.value, 0) ?? 0;
  const contributed = s?.investments.reduce((a, i) => a + i.contributed, 0) ?? 0;
  const avgInvest = s ? s.trend.slice(-3).reduce((a, t) => a + t.investments, 0) / 3 : 0;
  const expected = Number(s?.settings.expected_invest_return ?? 7);
  const tax = Number(s?.settings.invest_tax_pct ?? 10);
  const inflation = Number(s?.settings.inflation_pct ?? inflationRate ?? 5);

  const p = proj ?? { monthly: String(r2(avgInvest) || 500), years: "15", rate: String(expected) };
  const projData = useMemo(
    () => projection(invested, Number(p.monthly) || 0, (Number(p.rate) || 0) * (1 - tax / 100), Math.min(40, Number(p.years) || 1)),
    [invested, p.monthly, p.rate, p.years, tax],
  );
  const finalP = projData[projData.length - 1];
  const realValue = finalP ? finalP.Valoare / Math.pow(1 + inflation / 100, Number(p.years) || 0) : 0;

  if (!s) return <Skeleton />;

  const emergency = s.goals.find((g) => g.type === "emergency");
  const goals = s.goals.filter((g) => g.type === "goal");

  const saveGoal = async () => {
    if (!goal) return;
    const body = {
      name: goal.name,
      type: goal.type,
      target: Number(goal.target) || 0,
      initial: Number(goal.initial) || 0,
      deadline: goal.deadline ? `${goal.deadline}-01` : null,
      color: goal.color,
    };
    if (goal.id) await api("/api/crud/goals", "PUT", { id: goal.id, ...body });
    else await api("/api/crud/goals", "POST", body);
    setGoal(null);
    done(goal.id ? "Obiectiv actualizat" : "Obiectiv creat");
  };

  const deleteGoal = async (g: GoalView) => {
    if (
      !(await confirm({
        title: "Ștergere obiectiv",
        message: `Sigur dorești să ștergi obiectivul „${g.name}”? Contribuțiile rămân în lunile lor, ca economii generale.`,
        confirmText: "Șterge obiectivul",
        danger: true,
      }))
    )
      return;
    await api(`/api/crud/goals?id=${g.id}`, "DELETE");
    setGoal(null);
    done("Obiectiv șters");
  };

  const saveInv = async () => {
    if (!inv) return;
    const body = { name: inv.name, type: inv.type, expected_return: Number(inv.expected_return) || 0 };
    if (inv.id) await api("/api/crud/investments", "PUT", { id: inv.id, ...body });
    else await api("/api/crud/investments", "POST", body);
    setInv(null);
    done(inv.id ? "Investiție actualizată" : "Investiție adăugată");
  };

  const deleteInv = async (id: number, name: string) => {
    if (
      !(await confirm({
        title: "Ștergere investiție",
        message: `Sigur dorești să ștergi investiția „${name}” și întreg istoricul valorilor ei?`,
        confirmText: "Șterge investiția",
        danger: true,
      }))
    )
      return;
    await api(`/api/crud/investments?id=${id}`, "DELETE");
    setInv(null);
    done("Investiție ștearsă");
  };

  const saveValue = async () => {
    if (!valueFor) return;
    await api("/api/investment-values", "POST", { investment_id: valueFor.inv.id, month, value: Number(valueFor.value) || 0 });
    setValueFor(null);
    done("Valoarea a fost salvată");
  };

  // Ținta și suma inițială se citesc brut din baza de date (ținta 0 = calcul automat)
  const openGoalEditor = async (g: GoalView) => {
    const all = await api<{ id: number; target: number; initial: number }[]>("/api/crud/goals", "GET");
    const raw = all.find((x) => x.id === g.id);
    setGoal({
      id: g.id,
      name: g.name,
      type: g.type,
      target: raw && raw.target > 0 ? String(raw.target) : "",
      initial: String(raw?.initial ?? 0),
      deadline: g.deadline?.slice(0, 7) ?? "",
      color: g.color,
    });
  };

  const enableInvestments = s.settings?.enable_investments === "1";

  return (
    <>
      <PageHeader
        title="Economii"
        intro={
          enableInvestments
            ? "Fondul de urgență vine primul. Apoi obiectivele cu termen, apoi investițiile pe termen lung."
            : "Fondul de urgență vine primul. Apoi obiectivele cu termen și prioritățile de economisire."
        }
        actions={
          <>
            {enableInvestments && (
              <button className="btn-ghost" onClick={() => setInv({ name: "", type: "ETF", expected_return: String(expected) })}>
                Adaugă investiție
              </button>
            )}
            <button className="btn-primary" onClick={() => setGoal({ name: "", type: "goal", target: "", initial: "0", deadline: "", color: GOAL_COLORS[goals.length % GOAL_COLORS.length] })}>
              Adaugă obiectiv
            </button>
          </>
        }
      />

      <Panel
        className="mb-6"
        title="Fondul de urgență"
        aside={emergency && <button className="btn-ghost" onClick={() => openGoalEditor(emergency)}>Editează</button>}
      >
        {emergency ? (
          <EmergencyGauge s={s} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-ink-soft">
              Un fond de {s.emergency.months} luni pentru cheltuielile tale esențiale înseamnă aproximativ{" "}
              <strong className="text-ink">{lei(s.emergency.target)}</strong>. Creează-l și alocă-i economii din Luna curentă.
            </p>
            <button
              className="btn-primary"
              onClick={() => setGoal({ name: "Fond de urgență", type: "emergency", target: "", initial: "0", deadline: "", color: "#C99A1E" })}
            >
              Creează fondul de urgență
            </button>
          </div>
        )}
      </Panel>

      <Panel className="mb-6" title="Obiective">
        {goals.length === 0 ? (
          <Empty title="Niciun obiectiv cu termen">Mașină nouă, vacanță, avans pentru o casă. Setează suma și data, iar aplicația îți spune cât să pui deoparte lunar.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {goals.map((g) => {
              const onTrack = !g.deadline || g.avgMonthly >= g.monthlyNeeded * 0.95;
              return (
                <div key={g.id} className="rounded-[8px] border border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-1.5 rounded-sm" style={{ background: g.color }} />
                      <h3 className="text-[17px] font-semibold">{g.name}</h3>
                    </div>
                    <button className="btn-ghost -mr-2 -mt-1 px-2" onClick={() => openGoalEditor(g)}>Editează</button>
                  </div>
                  <div className="num mt-3 flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="num font-display text-[20px] font-semibold sm:text-[22px]">{lei(g.saved)}</span>
                    <span className="whitespace-nowrap text-ink-soft">din {lei(g.target)}</span>
                  </div>
                  <div className="mt-2"><Bar value={g.pct} color={g.color} /></div>
                  <dl className="num mt-3 grid grid-cols-2 gap-2 text-[13px]">
                    <div><dt className="text-ink-soft">Termen</dt><dd>{g.deadline ? monthLabel(g.deadline.slice(0, 7)) : "fără termen"}</dd></div>
                    <div><dt className="text-ink-soft">Necesar lunar</dt><dd>{g.deadline ? lei(g.monthlyNeeded) : "–"}</dd></div>
                    <div><dt className="text-ink-soft">Media ta (3 luni)</dt><dd className={onTrack ? "" : "text-rosu"}>{lei(g.avgMonthly)}</dd></div>
                    <div><dt className="text-ink-soft">Atingere estimată</dt><dd>{g.pct >= 100 ? "atins" : g.eta ? monthLabel(g.eta) : "–"}</dd></div>
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {enableInvestments ? (
        <Panel title="Investiții">
          {s.investments.length === 0 ? (
            <Empty title="Nicio investiție încă">
              Când începi (ETF-uri, fonduri, depozite, titluri de stat), adaugă-le aici. Contribuțiile le introduci în Luna curentă, la Economii și investiții,
              iar valoarea o actualizezi când vrei.
            </Empty>
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 gap-6 md:grid-cols-3">
                <Stat label="Valoare totală" accent="var(--c-galben)"><Money value={invested} rate={s.fx.rate} size="lg" /></Stat>
                <Stat label="Contribuit" accent="var(--c-albastru)"><Money value={contributed} rate={s.fx.rate} size="lg" /></Stat>
                <Stat label="Câștig" accent="var(--c-leu)" hint={contributed > 0 ? pct(((invested - contributed) / contributed) * 100) : undefined}>
                  <Money value={invested - contributed} rate={s.fx.rate} size="lg" tone={invested >= contributed ? "leu" : "rosu"} />
                </Stat>
              </div>
              <div className="overflow-x-auto">
                <table className="num w-full min-w-[620px] text-[14px]">
                  <thead className="text-left text-[13px] text-ink-soft">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-3 font-medium">Investiție</th>
                      <th className="py-2 pr-3 text-right font-medium">Contribuit</th>
                      <th className="py-2 pr-3 text-right font-medium">Valoare</th>
                      <th className="py-2 pr-3 text-right font-medium">Câștig</th>
                      <th className="py-2 pr-3 font-medium">Evaluată</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {s.investments.map((i) => (
                      <tr key={i.id} className="border-b border-line/60">
                        <td className="py-2 pr-3">
                          {i.name}
                          <span className="block text-[12px] text-ink-soft">{i.type} · randament așteptat {pct(i.expected_return)}</span>
                        </td>
                        <td className="py-2 pr-3 text-right">{lei(i.contributed)}</td>
                        <td className="py-2 pr-3 text-right">{lei(i.value)}</td>
                        <td className={`py-2 pr-3 text-right ${i.gain >= 0 ? "text-leu" : "text-rosu"}`}>{lei(i.gain)}</td>
                        <td className="py-2 pr-3 text-[13px] text-ink-soft">{i.valueMonth ? monthLabel(i.valueMonth, true) : "după contribuții"}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <button className="btn-ghost px-2" onClick={() => setValueFor({ inv: i, value: String(r2(i.value)) })}>Actualizează valoarea</button>
                          <button className="btn-ghost px-2" onClick={() => setInv({ id: i.id, name: i.name, type: i.type, expected_return: String(i.expected_return) })}>Editează</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr]">
            <div className="flex flex-col gap-3">
              <h3 className="text-[16px] font-semibold">Proiecție</h3>
              <Field label="Contribuție lunară (lei)" hint={avgInvest ? `Media ta: ${lei(avgInvest)}` : undefined}>
                <input className="field num" type="number" min={0} value={p.monthly} onChange={(e) => setProj({ ...p, monthly: e.target.value })} />
              </Field>
              <Field label="Randament anual brut (%)" hint={`După impozit de ${pct(tax)}: ${pct((Number(p.rate) || 0) * (1 - tax / 100))}`}>
                <input className="field num" type="number" step={0.5} value={p.rate} onChange={(e) => setProj({ ...p, rate: e.target.value })} />
              </Field>
              <Field label="Orizont (ani)">
                <input className="field num" type="number" min={1} max={40} value={p.years} onChange={(e) => setProj({ ...p, years: e.target.value })} />
              </Field>
              {finalP && (
                <div className="mt-2 rounded-md bg-galben-tint/70 p-3">
                  <div className="text-[13px] text-ink-soft">Peste {p.years} ani</div>
                  <div className="num font-display text-[24px] font-semibold">{lei(finalP.Valoare)}</div>
                  <div className="text-[12px] text-ink-soft">
                    din care {lei(finalP.Valoare - finalP.Contribuții)} câștig. În bani de azi, la inflație de {pct(inflation)}: {lei(realValue)}.
                  </div>
                </div>
              )}
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer>
                <AreaChart data={projData} margin={{ top: 6, right: 8, left: -4, bottom: 0 }}>
                  <CartesianGrid stroke="var(--c-line)" vertical={false} />
                  <XAxis dataKey="an" minTickGap={20} tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(v: number) => lei(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                  <Area dataKey="Valoare" stroke="var(--c-galben)" fill="var(--c-galben-tint)" strokeWidth={2} />
                  <Area dataKey="Contribuții" stroke="var(--c-albastru)" fill="var(--c-albastru-tint)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel title="Investiții">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-faint" />
                <h4 className="font-semibold text-ink text-[15px]">Modulul de investiții este dezactivat</h4>
              </div>
              <p className="mt-1 text-[13px] text-ink-soft max-w-xl">
                Secțiunea este ascunsă pentru a păstra aplicația simplă cât timp nu deții investiții (ETF-uri, fonduri, titluri de stat, depozite). Poți activa oricând modulul de aici sau din Setări.
              </p>
            </div>
            <button
              className="btn-primary shrink-0 text-[13px]"
              onClick={async () => {
                await api("/api/settings", "PUT", { enable_investments: "1" });
                done("Modulul de investiții a fost activat");
              }}
            >
              Activează investițiile
            </button>
          </div>
        </Panel>
      )}

      <Modal open={!!goal} onClose={() => setGoal(null)} title={goal?.id ? "Editează obiectivul" : goal?.type === "emergency" ? "Fond de urgență" : "Obiectiv nou"}>
        {goal && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveGoal(); }}>
            <Field label="Nume">
              <input className="field" value={goal.name} onChange={(e) => setGoal({ ...goal, name: e.target.value })} required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Suma țintă (lei)" hint={goal.type === "emergency" ? `Gol = automat (${s.emergency.months} luni de nevoi esențiale)` : undefined}>
                <input className="field num" type="number" min={0} value={goal.target} onChange={(e) => setGoal({ ...goal, target: e.target.value })} required={goal.type === "goal"} />
              </Field>
              <Field label="Deja strâns (lei)" hint="Suma existentă înainte de a folosi aplicația">
                <input className="field num" type="number" min={0} value={goal.initial} onChange={(e) => setGoal({ ...goal, initial: e.target.value })} />
              </Field>
              {goal.type === "goal" && (
                <Field label="Termen (opțional)">
                  <input className="field" type="month" value={goal.deadline} onChange={(e) => setGoal({ ...goal, deadline: e.target.value })} />
                </Field>
              )}
              <Field label="Culoare">
                <div className="flex flex-wrap gap-2.5 pt-1 sm:gap-2">
                  {GOAL_COLORS.map((c) => (
                    <button key={c} type="button" aria-label={`Culoarea ${c}`} onClick={() => setGoal({ ...goal, color: c })}
                      className={`h-9 w-9 rounded-full sm:h-7 sm:w-7 ${goal.color === c ? "ring-2 ring-ink ring-offset-2" : ""}`} style={{ background: c }} />
                  ))}
                </div>
              </Field>
            </div>
            <div className="form-actions sm:justify-between">
              {goal.id ? (
                <button type="button" className="btn-danger" onClick={() => deleteGoal(s.goals.find((g) => g.id === goal.id)!)}>Șterge obiectivul</button>
              ) : <span className="hidden sm:block" />}
              <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
                <button type="button" className="btn-ghost" onClick={() => setGoal(null)}>Renunță</button>
                <button type="submit" className="btn-primary">{goal.id ? "Salvează" : "Creează"}</button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!inv} onClose={() => setInv(null)} title={inv?.id ? "Editează investiția" : "Investiție nouă"}>
        {inv && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveInv(); }}>
            <Field label="Nume">
              <input className="field" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} placeholder="ex. ETF S&P 500" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tip">
                <select className="field" value={inv.type} onChange={(e) => setInv({ ...inv, type: e.target.value })}>
                  {["ETF", "Acțiuni", "Fond mutual", "Depozit", "Titluri de stat", "Pilon III", "Crypto", "Altele"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Randament anual așteptat (%)">
                <input className="field num" type="number" step={0.1} value={inv.expected_return} onChange={(e) => setInv({ ...inv, expected_return: e.target.value })} />
              </Field>
            </div>
            <div className="form-actions sm:justify-between">
              {inv.id ? <button type="button" className="btn-danger" onClick={() => deleteInv(inv.id!, inv.name)}>Șterge investiția</button> : <span className="hidden sm:block" />}
              <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
                <button type="button" className="btn-ghost" onClick={() => setInv(null)}>Renunță</button>
                <button type="submit" className="btn-primary">{inv.id ? "Salvează" : "Adaugă"}</button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!valueFor} onClose={() => setValueFor(null)} title={`Valoarea în ${monthLabel(month)}`}>
        {valueFor && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveValue(); }}>
            <Field label={`${valueFor.inv.name}: valoarea totală a poziției (lei)`} hint="Din contul brokerului sau al băncii, la sfârșitul lunii">
              <input className="field num" type="number" min={0} step="0.01" value={valueFor.value} onChange={(e) => setValueFor({ ...valueFor, value: e.target.value })} autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setValueFor(null)}>Renunță</button>
              <button type="submit" className="btn-primary">Salvează valoarea</button>
            </div>
          </form>
        )}
      </Modal>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

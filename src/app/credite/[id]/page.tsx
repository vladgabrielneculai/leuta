"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bar as RBar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { annualInsuranceMonthly, type Loan, type LoanStatus, type Prepayment, type SimResult } from "@/lib/loan";
import type { Strategy } from "@/lib/util";
import { addMonths, currentMonth, lei, monthDiff, monthLabel, pct, termLabel } from "@/lib/util";
import LoanForm from "@/components/LoanForm";
import LoanScheduleManager from "@/components/LoanScheduleManager";
import { api, chartTooltipStyle, Empty, Field, Modal, Money, PageHeader, Panel, Stat, Toast, useApi, useApp } from "@/components/ui";

type SimWithStatus = SimResult & { status: LoanStatus };
type SimResponse = {
  loan: Loan;
  prepayments: (Prepayment & { id: number })[];
  customSchedule?: any[] | null;
  original: SimWithStatus;
  actual: SimWithStatus;
  term: SimWithStatus;
  installment: SimWithStatus;
};

type Scenario = { extraMonthly: number; extraFrom: string; oneTimeAmount: number; oneTimeMonth: string; irccShock: number };

const kLei = (v: number) => `${Math.round(v / 1000)}k`;
const fmtDate = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "–");
const monthName = (d: string) => monthLabel(d.slice(0, 7)).split(" ")[0];

async function runSim(loanId: number, scenario: Record<string, unknown>) {
  return api<SimResponse>("/api/simulate", "POST", { loanId, scenario });
}

export default function LoanDetail() {
  const params = useParams();
  const id = Number(params?.id);
  const router = useRouter();
  const { bump, confirm } = useApp();
  const now = currentMonth();
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [data, setData] = useState<SimResponse | null>(null);
  const [lumpOnly, setLumpOnly] = useState<SimResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sc, setSc] = useState<Scenario>({ extraMonthly: 0, extraFrom: addMonths(now, 1), oneTimeAmount: 10000, oneTimeMonth: addMonths(now, 1), irccShock: 0 });
  const [pre, setPre] = useState({ month: now, amount: "", strategy: "" as "" | Strategy, note: "" });
  const [tableMode, setTableMode] = useState<"years" | "months">("years");
  const [tableSource, setTableSource] = useState<"actual" | "term" | "installment">("actual");
  const [reloadKey, setReloadKey] = useState(0);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjPaidPrincipal, setAdjPaidPrincipal] = useState<number>(0);
  const [adjPaidInterest, setAdjPaidInterest] = useState<number>(0);
  const [adjCurrentBalance, setAdjCurrentBalance] = useState<number>(0);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const { data: settings } = useApi<Record<string, string>>("/api/settings");

  useEffect(() => {
    const t = setTimeout(() => {
      const scenario = {
        extraMonthly: sc.extraMonthly,
        extraFrom: sc.extraFrom,
        oneTime: sc.oneTimeAmount > 0 ? [{ month: sc.oneTimeMonth, amount: sc.oneTimeAmount }] : [],
        irccShock: sc.irccShock,
      };
      runSim(id, scenario).then(setData).catch((e) => setError(e.message));
      runSim(id, { oneTime: scenario.oneTime, irccShock: sc.irccShock }).then(setLumpOnly).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [id, sc, reloadKey]);

  const balanceChart = useMemo(() => {
    if (!data) return [];
    const len = data.original.rows.length;
    const out = [];
    for (let i = 0; i < len; i++) {
      out.push({
        luna: data.original.rows[i].month,
        Inițial: Math.round(data.original.rows[i]?.balanceEnd ?? 0),
        Actual: data.actual.rows[i] ? Math.round(data.actual.rows[i].balanceEnd) : 0,
        "Scenariu: perioadă": data.term.rows[i] ? Math.round(data.term.rows[i].balanceEnd) : 0,
        "Scenariu: rată": data.installment.rows[i] ? Math.round(data.installment.rows[i].balanceEnd) : 0,
      });
    }
    return out;
  }, [data]);

  const paymentChart = useMemo(() => {
    if (!data) return [];
    const from = Math.max(0, monthDiff(data.loan.start_date.slice(0, 7), now) - 1);
    const len = Math.max(data.term.rows.length, data.installment.rows.length);
    const out = [];
    for (let i = from; i < len; i++) {
      out.push({
        luna: (data.installment.rows[i] ?? data.term.rows[i]).month,
        "Reducerea perioadei": data.term.rows[i] ? Math.round(data.term.rows[i].payment) : null,
        "Reducerea ratei": data.installment.rows[i] ? Math.round(data.installment.rows[i].payment) : null,
      });
    }
    return out;
  }, [data, now]);

  const table = useMemo(() => {
    if (!data) return [];
    const rows = data[tableSource].rows;
    if (tableMode === "months") return rows.map((r) => ({ key: r.month, label: monthLabel(r.month, true), ...r, count: 1 }));
    const byYear = new Map<string, { interest: number; principal: number; prepayment: number; fee: number; payment: number; balanceEnd: number; rate: number; count: number }>();
    for (const r of rows) {
      const y = r.month.slice(0, 4);
      const cur = byYear.get(y) ?? { interest: 0, principal: 0, prepayment: 0, fee: 0, payment: 0, balanceEnd: 0, rate: r.rate, count: 0 };
      cur.interest += r.interest;
      cur.principal += r.principal;
      cur.prepayment += r.prepayment;
      cur.fee += r.fee;
      cur.payment += r.payment;
      cur.balanceEnd = r.balanceEnd;
      cur.rate = r.rate;
      cur.count += 1;
      byYear.set(y, cur);
    }
    return [...byYear.entries()].map(([y, v]) => ({ key: y, label: y, ...v }));
  }, [data, tableMode, tableSource]);

  if (error) return <Empty title="Creditul nu a putut fi încărcat">{error}</Empty>;
  if (!data) return <p className="text-ink-soft">Se calculează graficul de rambursare…</p>;

  const { loan, actual, original, term, installment, prepayments } = data;
  const st = actual.status;
  const expected = Number(settings?.expected_invest_return ?? 7);
  const tax = Number(settings?.invest_tax_pct ?? 10);
  const netReturn = expected * (1 - tax / 100);
  const fixedEnd = addMonths(loan.start_date.slice(0, 7), loan.fixed_months);
  const variableRate = loan.margin + loan.ircc + sc.irccShock;
  const scenarioActive = sc.extraMonthly > 0 || sc.oneTimeAmount > 0;
  const annualMonthly = annualInsuranceMonthly(loan);
  // Prima creștere importantă a ratei de acum înainte (ex. trecerea de la dobânda fixă la cea variabilă).
  const rateJump = (() => {
    const rows = actual.rows;
    for (let i = 1; i < rows.length - 1; i++) {
      if (rows[i].month <= now || rows[i].prepayment > 0 || rows[i - 1].prepayment > 0) continue;
      // Luna doar cu dobândă de la schimbarea dobânzii (BCR) nu e rata nouă: comparăm cu rata de după ea.
      const r = rows[i].principal === 0 && rows[i + 1] ? rows[i + 1] : rows[i];
      const from = rows[i - 1].payment + rows[i - 1].insurance;
      const to = r.payment + r.insurance;
      if (from > 0 && (to - from) / from > 0.05) return { month: rows[i].month, from, payment: to, rate: r.rate };
    }
    return null;
  })();

  // Rambursare vs investiție pentru suma unică
  const lumpSaved = lumpOnly ? lumpOnly.actual.totalInterest - lumpOnly.term.totalInterest - lumpOnly.term.totalFees + lumpOnly.actual.totalFees : 0;
  const lumpMonthsSaved = lumpOnly ? lumpOnly.actual.months - lumpOnly.term.months : 0;
  const horizon = Math.max(1, actual.rows.length - Math.max(0, monthDiff(loan.start_date.slice(0, 7), sc.oneTimeMonth) - 1));
  const investGain = sc.oneTimeAmount * (Math.pow(1 + netReturn / 100 / 12, horizon) - 1);

  const addPrepayment = async () => {
    if (!Number(pre.amount)) return;
    await api("/api/crud/loan_prepayments", "POST", {
      loan_id: loan.id,
      month: pre.month,
      amount: Number(pre.amount),
      strategy: pre.strategy || loan.strategy,
      note: pre.note,
    });
    setPre({ ...pre, amount: "", note: "" });
    setReloadKey((k) => k + 1);
    bump();
    setToast("Plata anticipată a fost înregistrată");
  };

  const deletePrepayment = async (p: Prepayment & { id: number }) => {
    if (
      !(await confirm({
        title: "Ștergere plată anticipată",
        message: `Sigur dorești să ștergi plata anticipată de ${lei(p.amount)} din ${monthLabel(p.month)}?`,
        confirmText: "Șterge plata",
        danger: true,
      }))
    )
      return;
    await api(`/api/crud/loan_prepayments?id=${p.id}`, "DELETE");
    setReloadKey((k) => k + 1);
    bump();
    setToast("Plata anticipată a fost ștearsă");
  };

  const deleteLoan = async () => {
    if (
      !(await confirm({
        title: "Ștergere contract credit",
        message: `Sigur dorești să ștergi creditul „${loan.name}” și toate plățile lui anticipate? Această acțiune nu poate fi anulată.`,
        confirmText: "Șterge creditul",
        danger: true,
      }))
    )
      return;
    await api(`/api/crud/loans?id=${loan.id}`, "DELETE");
    bump();
    router.push("/credite");
  };

  const openAdjustModal = () => {
    const paidP = loan.already_paid_principal ?? Math.max(0, loan.principal - st.balance);
    const paidI = loan.already_paid_interest ?? st.interestPaid;
    const curB = Math.max(0, loan.principal - paidP);
    setAdjPaidPrincipal(paidP);
    setAdjPaidInterest(paidI);
    setAdjCurrentBalance(curB);
    setAdjustOpen(true);
  };

  const handleSaveAdjust = async () => {
    setAdjustSaving(true);
    try {
      await api("/api/crud/loans", "PUT", {
        id: loan.id,
        already_paid_principal: adjPaidPrincipal,
        already_paid_interest: adjPaidInterest,
      });
      setAdjustOpen(false);
      setReloadKey((k) => k + 1);
      bump();
      setToast("Situația achitată a fost actualizată conform băncii!");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Eroare la actualizare");
    } finally {
      setAdjustSaving(false);
    }
  };

  const cards = [
    { key: "actual", title: "Fără plăți suplimentare", sub: "Doar plățile deja înregistrate", sim: actual, color: "#8A989C" },
    { key: "term", title: "Reducerea perioadei", sub: "Rata rămâne, creditul se termină mai devreme", sim: term, color: "#6A4E99" },
    { key: "installment", title: "Reducerea ratei", sub: "Perioada rămâne, rata scade", sim: installment, color: "#2E5C8A" },
  ] as const;
  const bestInterest = Math.min(term.totalInterest, installment.totalInterest);

  return (
    <>
      <Link href="/credite" className="mb-3 inline-block text-[14px] text-albastru hover:underline">‹ Toate creditele</Link>
      <PageHeader
        title={loan.name}
        intro={`${loan.bank || "Bancă nespecificată"} · ${lei(loan.principal)} pe ${termLabel(loan.term_months)} · ${
          loan.schedule_type === "annuity" ? "rate egale" : "rate descrescătoare"
        } · acordat în ${monthLabel(loan.start_date.slice(0, 7))}`}
        actions={
          <>
            <button className="btn-ghost" onClick={() => setEditing(true)}>Editează</button>
            <button className="btn-danger" onClick={deleteLoan}>Șterge creditul</button>
          </>
        }
      />

      <div className="panel mb-6 grid grid-cols-2 gap-6 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Bani deja plătiți" accent="#3D7A4E" hint={`${lei(st.principalPaid)} principal · ${lei(st.interestPaid)} dobândă`}>
          <Money value={st.totalPaidSoFar} size="lg" tone="leu" />
        </Stat>
        <Stat label="Sold rămas" accent="#6A4E99" hint={`${pct(st.paidPct, 0)} din principal achitat`}><Money value={st.balance} size="lg" /></Stat>
        <Stat label="Rata următoare" accent="#6A4E99" hint={st.nextInsurance ? `+ ${lei(st.nextInsurance, true)} asigurări = ${lei(st.nextPayment + st.nextInsurance, true)}` : undefined}>
          <Money value={st.nextPayment} size="lg" decimals />
        </Stat>
        <Stat label="Dobânda acum" accent="#2E5C8A" hint={st.inFixed ? `Fixă încă ${st.monthsToVariable} luni` : "Marjă + IRCC"}>
          <span className="num font-display text-[26px] font-semibold">{pct(st.currentRate, 2)}</span>
        </Stat>
        <Stat label="Dobândă totală" accent="#B5456A" hint={`Inițial: ${lei(original.totalInterest)}`}><Money value={actual.totalInterest} size="lg" /></Stat>
        <Stat label="Economisit până acum" accent="#3D7A4E" hint={`${original.months - actual.months} luni mai puțin`}>
          <Money value={original.totalInterest - actual.totalInterest} size="lg" tone="leu" />
        </Stat>
      </div>

      {/* Situația la zi din aplicația băncii + asigurări anuale */}
      {(loan.status_date || annualMonthly > 0 || rateJump) && (
        <Panel className="mb-6" title="Situația la zi de la bancă">
          {(loan.arrears_amount ?? 0) > 0 && (
            <p className="mb-4 rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">
              Ai o sumă restantă de {lei(loan.arrears_amount ?? 0, true)}
              {(loan.arrears_count ?? 0) > 0 ? ` (${loan.arrears_count} rate restante)` : ""}. Am adăugat-o la plățile creditului din{" "}
              {monthLabel((loan.status_date ?? now).slice(0, 7))}.
            </p>
          )}
          {rateJump && (
            <p className="mb-4 rounded-md bg-galben-tint p-3 text-[13px]">
              ⚠️ Din <strong>{monthLabel(rateJump.month)}</strong> rata crește de la {lei(rateJump.from, true)} la{" "}
              <strong>{lei(rateJump.payment, true)}</strong> (+{lei(rateJump.payment - rateJump.from)} pe lună), la trecerea pe dobânda de {pct(rateJump.rate, 2)}.
            </p>
          )}
          <dl className="num grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3 lg:grid-cols-4">
            {loan.status_date && (
              <>
                <div><dt className="text-ink-soft">Sold curent (credit actual)</dt><dd className="font-semibold text-mov">{lei(loan.current_balance ?? 0, true)}</dd></div>
                <div><dt className="text-ink-soft">Următoarea rată</dt><dd className="font-medium">{lei(loan.next_payment_amount ?? 0, true)} · {fmtDate(loan.next_payment_date)}</dd></div>
                <div><dt className="text-ink-soft">Principal / Dobândă</dt><dd className="font-medium">{lei(loan.next_principal ?? 0, true)} / {lei(loan.next_interest ?? 0, true)}</dd></div>
                <div><dt className="text-ink-soft">Taxe lunare (asigurare viață)</dt><dd className="font-medium">{lei(loan.next_fees ?? 0, true)}</dd></div>
                <div><dt className="text-ink-soft">Rata dobânzii</dt><dd className="font-medium">{pct(loan.current_rate ?? 0, 2)}</dd></div>
                <div><dt className="text-ink-soft">Maturitate</dt><dd className="font-medium">{fmtDate(loan.maturity_date)}</dd></div>
                <div><dt className="text-ink-soft">Restanțe</dt><dd className="font-medium">{(loan.arrears_amount ?? 0) > 0 ? `${lei(loan.arrears_amount ?? 0, true)} (${loan.arrears_count ?? 0} rate)` : "Nu"}</dd></div>
                {loan.contract_nr && <div><dt className="text-ink-soft">Nr. contract</dt><dd className="font-medium">{loan.contract_nr}</dd></div>}
              </>
            )}
            {(loan.pad_amount ?? 0) > 0 && (
              <div><dt className="text-ink-soft">Asigurare PAD (anual)</dt><dd className="font-medium">{lei(loan.pad_amount ?? 0, true)} · în {loan.pad_due_date ? monthName(loan.pad_due_date) : "–"}</dd></div>
            )}
            {(loan.opt_ins_amount ?? 0) > 0 && (
              <div><dt className="text-ink-soft">Asigurare facultativă (anual)</dt><dd className="font-medium">{lei(loan.opt_ins_amount ?? 0, true)} · în {loan.opt_ins_due_date ? monthName(loan.opt_ins_due_date) : "–"}</dd></div>
            )}
            {annualMonthly > 0 && (
              <div><dt className="text-ink-soft">De pus deoparte lunar</dt><dd className="font-medium text-leu">{lei(annualMonthly, true)} / lună</dd></div>
            )}
          </dl>
          {loan.status_date && (
            <p className="mt-3 text-[12px] text-ink-faint">
              Actualizat la {fmtDate(loan.status_date)}
              {Number(loan.use_schedule) === 1 ? " · ratele, dobânda, asigurarea și soldul se calculează din graficul băncii" : ""}.
            </p>
          )}
        </Panel>
      )}

      {/* Situația banilor deja plătiți & Raportare la zi */}
      <Panel
        className="mb-6"
        title="Bani deja plătiți & Situația la zi"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost text-[13px] py-1" onClick={openAdjustModal}>
              ⚡ Ajustează conform extrasului bancar
            </button>
            <button className="btn-ghost text-[13px] py-1" onClick={() => setEditing(true)}>
              ✏️ Editează contractul
            </button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-leu/30 bg-leu-tint/30 p-4">
            <div className="text-[12px] font-medium text-ink-soft">Total plătit până în prezent</div>
            <div className="num font-display text-[22px] font-bold text-leu mt-0.5">{lei(st.totalPaidSoFar)}</div>
            <div className="text-[12px] text-ink-soft mt-1">
              {st.installmentsPaidCount} rate achitate ({pct(st.paidPct, 1)} din principal)
            </div>
          </div>
          <div className="rounded-lg border border-line bg-paper p-4">
            <div className="text-[12px] font-medium text-ink-soft">Principal restituit băncii</div>
            <div className="num font-semibold text-[18px] text-ink mt-0.5">{lei(st.principalPaid)}</div>
            <div className="text-[12px] text-ink-soft mt-1">
              Din totalul împrumutat de {lei(loan.principal)}
            </div>
          </div>
          <div className="rounded-lg border border-line bg-paper p-4">
            <div className="text-[12px] font-medium text-ink-soft">Dobândă plătită băncii</div>
            <div className="num font-semibold text-[18px] text-ink mt-0.5">{lei(st.interestPaid)}</div>
            <div className="text-[12px] text-ink-soft mt-1">
              Cost al creditului suportat până acum
            </div>
          </div>
          <div className="rounded-lg border border-mov/30 bg-mov-tint/30 p-4">
            <div className="text-[12px] font-medium text-ink-soft">Sold curent datorat</div>
            <div className="num font-display text-[22px] font-bold text-mov mt-0.5">{lei(st.balance)}</div>
            <div className="text-[12px] text-ink-soft mt-1">
              {st.remainingMonths} luni rămase din contract
            </div>
          </div>
        </div>

        {/* Progresie vizuală plată principal */}
        <div className="mt-4 pt-4 border-t border-line">
          <div className="flex justify-between text-[13px] mb-1.5">
            <span className="font-medium text-ink">Progres rambursare principal: <strong className="text-leu">{pct(st.paidPct, 1)}</strong></span>
            <span className="text-ink-soft">{lei(st.principalPaid)} achitați din {lei(loan.principal)} total</span>
          </div>
          <div className="h-3 w-full rounded-full bg-line overflow-hidden">
            <div
              className="h-full rounded-full bg-leu transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, st.paidPct))}%` }}
            />
          </div>
        </div>
      </Panel>

      {/* Linia de timp a creditului */}
      <Panel className="mb-6" title="Linia de timp">
        <div className="relative h-8 w-full overflow-hidden rounded-[6px] bg-mov-tint">
          <div className="absolute inset-y-0 left-0 bg-albastru-tint" style={{ width: `${(loan.fixed_months / loan.term_months) * 100}%` }} />
          <div className="absolute inset-y-0 left-0 bg-leu/80" style={{ width: `${(Math.min(loan.term_months, Math.max(0, monthDiff(loan.start_date.slice(0, 7), now))) / loan.term_months) * 100}%`, opacity: 0.35 }} />
          <div className="absolute inset-y-0 border-r-2 border-dashed border-rosu" style={{ left: `${(actual.months / loan.term_months) * 100}%` }} title="Finalul estimat" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink-soft">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-albastru-tint ring-1 ring-albastru/30" />Dobândă fixă {pct(loan.fixed_rate, 2)} până în {monthLabel(fixedEnd)}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-mov-tint ring-1 ring-mov/30" />Variabilă {pct(loan.margin, 2)} + IRCC {pct(loan.ircc, 2)} = {pct(loan.margin + loan.ircc, 2)}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-leu/40" />Timp scurs</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-0 border-r-2 border-dashed border-rosu" />Final estimat: {monthLabel(actual.payoffMonth)} (inițial {monthLabel(original.payoffMonth)})</span>
        </div>
      </Panel>

      {/* Schema de rambursare & Recalculare */}
      <LoanScheduleManager
        loan={loan}
        simResult={actual}
        customSchedule={data.customSchedule}
        onUpdated={() => {
          setReloadKey((k) => k + 1);
          bump();
          setToast("Schema de rambursare a fost actualizată");
        }}
        onPrepaymentAdded={async (amount, month, strategy, note) => {
          await api("/api/crud/loan_prepayments", "POST", {
            loan_id: loan.id,
            month,
            amount,
            strategy,
            note,
          });
          setReloadKey((k) => k + 1);
          bump();
          setToast("Plata anticipată a fost adăugată");
        }}
      />

      {/* Simulator */}
      <Panel className="mb-6" title="Simulator de plăți anticipate">
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="flex flex-col gap-5">
            <div>
              <Field label={`Sumă suplimentară lunară: ${lei(sc.extraMonthly)}`}>
                <input type="range" min={0} max={10000} step={100} value={sc.extraMonthly} className="w-full accent-mov"
                  onChange={(e) => setSc({ ...sc, extraMonthly: Number(e.target.value) })} />
              </Field>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input className="field num" type="number" min={0} step={50} value={sc.extraMonthly} aria-label="Sumă lunară"
                  onChange={(e) => setSc({ ...sc, extraMonthly: Number(e.target.value) || 0 })} />
                <input className="field" type="month" value={sc.extraFrom} aria-label="Începând cu"
                  onChange={(e) => setSc({ ...sc, extraFrom: e.target.value })} />
              </div>
            </div>
            <div>
              <span className="label">Plată unică</span>
              <div className="grid grid-cols-2 gap-2">
                <input className="field num" type="number" min={0} step={1000} value={sc.oneTimeAmount} aria-label="Sumă unică"
                  onChange={(e) => setSc({ ...sc, oneTimeAmount: Number(e.target.value) || 0 })} />
                <input className="field" type="month" value={sc.oneTimeMonth} aria-label="Luna plății unice"
                  onChange={(e) => setSc({ ...sc, oneTimeMonth: e.target.value })} />
              </div>
            </div>
            <div>
              <Field label={`Variație IRCC: ${sc.irccShock > 0 ? "+" : ""}${sc.irccShock.toFixed(2)} pp`} hint={`Dobânda variabilă ar fi ${pct(variableRate, 2)}`}>
                <input type="range" min={-3} max={5} step={0.25} value={sc.irccShock} className="w-full accent-rosu"
                  onChange={(e) => setSc({ ...sc, irccShock: Number(e.target.value) })} />
              </Field>
            </div>
            {sc.oneTimeMonth < fixedEnd && loan.fee_fixed_pct > 0 && sc.oneTimeAmount > 0 && (
              <p className="rounded-md bg-galben-tint p-3 text-[13px]">
                Plata unică cade în perioada fixă: comision de {lei((sc.oneTimeAmount * loan.fee_fixed_pct) / 100)}. După{" "}
                {monthLabel(fixedEnd)} comisionul este {pct(loan.fee_variable_pct)}.
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {cards.map((c) => {
              const nextAfter = c.sim.rows.find((r) => r.month > (sc.extraFrom < sc.oneTimeMonth ? sc.extraFrom : sc.oneTimeMonth));
              const saved = actual.totalInterest - c.sim.totalInterest;
              const isBest = c.key !== "actual" && scenarioActive && c.sim.totalInterest === bestInterest;
              return (
                <div key={c.key} className={`rounded-[8px] border p-4 ${isBest ? "border-mov bg-mov-tint/40" : "border-line"}`}>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-1.5 rounded-sm" style={{ background: c.color }} />
                    <h3 className="text-[16px] font-semibold">{c.title}</h3>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-soft">{c.sub}</p>
                  <dl className="num mt-4 flex flex-col gap-2.5 text-[14px]">
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">Ultima rată</dt><dd className="font-medium">{monthLabel(c.sim.payoffMonth)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">Durată totală</dt><dd className="font-medium">{Math.floor(c.sim.months / 12)} ani {c.sim.months % 12} luni</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">Rata după plată</dt><dd className="font-medium">{nextAfter ? lei(nextAfter.payment) : "–"}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">Dobândă totală</dt><dd className="font-medium">{lei(c.sim.totalInterest)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">Comisioane</dt><dd className="font-medium">{lei(c.sim.totalFees)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink-soft">Total de plătit</dt><dd className="font-medium">{lei(c.sim.totalPaid)}</dd></div>
                  </dl>
                  {c.key !== "actual" && (
                    <div className="mt-4 border-t border-line pt-3">
                      <div className="text-[12px] text-ink-soft">Economie față de fără plăți suplimentare</div>
                      <div className="num font-display text-[22px] font-semibold text-leu">{lei(saved - (c.sim.totalFees - actual.totalFees))}</div>
                      <div className="text-[12px] text-ink-soft">{actual.months - c.sim.months} luni mai puțin</div>
                    </div>
                  )}
                  {isBest && <p className="mt-2 text-[12px] font-medium text-mov">Cea mai mare economie de dobândă</p>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[15px] font-semibold">Soldul în timp</h3>
            <div className="h-[280px]">
              <ResponsiveContainer>
                <LineChart data={balanceChart} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke="#D5DDD8" vertical={false} />
                  <XAxis dataKey="luna" tickFormatter={(m) => m.slice(0, 4)} minTickGap={40} tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={kLei} tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: number) => lei(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
                  <ReferenceLine x={now} stroke="#3D7A4E" strokeDasharray="4 3" label={{ value: "azi", fontSize: 11, fill: "#3D7A4E", position: "top" }} />
                  <ReferenceLine x={fixedEnd} stroke="#2E5C8A" strokeDasharray="2 3" label={{ value: "variabilă", fontSize: 11, fill: "#2E5C8A", position: "top" }} />
                  <Line dataKey="Inițial" stroke="#8A989C" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
                  <Line dataKey="Actual" stroke="#1C2B30" dot={false} strokeWidth={2} />
                  <Line dataKey="Scenariu: perioadă" stroke="#6A4E99" dot={false} strokeWidth={2} />
                  <Line dataKey="Scenariu: rată" stroke="#2E5C8A" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[15px] font-semibold">Rata lunară în cele două variante</h3>
            <div className="h-[280px]">
              <ResponsiveContainer>
                <LineChart data={paymentChart} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke="#D5DDD8" vertical={false} />
                  <XAxis dataKey="luna" tickFormatter={(m) => m.slice(0, 4)} minTickGap={40} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: number) => lei(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
                  <Line dataKey="Reducerea perioadei" stroke="#6A4E99" dot={false} strokeWidth={2} connectNulls={false} />
                  <Line dataKey="Reducerea ratei" stroke="#2E5C8A" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Panel>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        {/* Rambursare vs investiție */}
        {settings?.enable_investments === "1" ? (
          <Panel title={`Plătesc ${lei(sc.oneTimeAmount)} în avans sau îi investesc?`}>
            {sc.oneTimeAmount <= 0 ? (
              <p className="text-ink-soft">Setează o plată unică în simulator pentru comparație.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-md bg-mov-tint/60 p-4">
                    <div className="text-[13px] text-ink-soft">Rambursare (reducerea perioadei)</div>
                    <div className="num font-display text-[26px] font-semibold text-mov">{lei(lumpSaved)}</div>
                    <div className="text-[12px] text-ink-soft">dobândă economisită, garantat · {lumpMonthsSaved} luni mai puțin</div>
                  </div>
                  <div className="rounded-md bg-galben-tint/70 p-4">
                    <div className="text-[13px] text-ink-soft">Investiție la {pct(netReturn)} net/an</div>
                    <div className="num font-display text-[26px] font-semibold text-galben">{lei(investGain)}</div>
                    <div className="text-[12px] text-ink-soft">câștig estimat în {Math.round(horizon / 12)} ani, fără garanție</div>
                  </div>
                </div>
                <p className="mt-4 text-[14px] text-ink-soft">
                  {lumpSaved > investGain
                    ? "Rambursarea câștigă și este fără risc. "
                    : "Investiția ar putea aduce mai mult pe termen lung, dar randamentul nu e garantat. "}
                  Cu reducerea perioadei, după achitare rămâi cu {lumpMonthsSaved} rate libere pe care le poți investi, avantaj neinclus aici.
                  Randamentul și impozitul se schimbă din Setări.
                </p>
              </>
            )}
          </Panel>
        ) : (
          <Panel title={`Economie din plata anticipată de ${lei(sc.oneTimeAmount)}`}>
            {sc.oneTimeAmount <= 0 ? (
              <p className="text-ink-soft">Setează o plată unică în simulator pentru a vedea impactul.</p>
            ) : (
              <>
                <div className="rounded-md bg-mov-tint/60 p-4">
                  <div className="text-[13px] text-ink-soft">Rambursare cu reducerea perioadei</div>
                  <div className="num font-display text-[26px] font-semibold text-mov">{lei(lumpSaved)}</div>
                  <div className="text-[12px] text-ink-soft">
                    dobândă totală economisită în mod garantat · {lumpMonthsSaved} luni ({Math.round((lumpMonthsSaved / 12) * 10) / 10} ani) mai repede fără datorii
                  </div>
                </div>
                <p className="mt-4 text-[14px] text-ink-soft">
                  Fiecare leu plătit în avans reduce direct principalul și scutește plata dobânzii viitoare. Comparația cu investițiile poate fi activată oricând din Setări.
                </p>
              </>
            )}
          </Panel>
        )}

        {/* Plăți anticipate înregistrate */}
        <Panel title="Plăți anticipate făcute">
          <form
            className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[160px_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              addPrepayment();
            }}
          >
            <input className="field" type="month" value={pre.month} onChange={(e) => setPre({ ...pre, month: e.target.value })} aria-label="Luna" required />
            <input className="field num" type="number" min={1} step="0.01" placeholder="Sumă (lei)" value={pre.amount} onChange={(e) => setPre({ ...pre, amount: e.target.value })} aria-label="Sumă" required />
            <select className="field" value={pre.strategy} onChange={(e) => setPre({ ...pre, strategy: e.target.value as Strategy | "" })} aria-label="Efect">
              <option value="">{loan.strategy === "term" ? "Reduce perioada" : "Reduce rata"} (implicit)</option>
              <option value="term">Reduce perioada</option>
              <option value="installment">Reduce rata</option>
            </select>
            <button className="btn-primary" type="submit">Înregistrează</button>
          </form>
          {prepayments.length === 0 ? (
            <p className="text-ink-soft">Nicio plată anticipată încă. Ce înregistrezi aici intră automat în bugetul lunii ca bani puși deoparte.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {prepayments.map((p) => {
                const row = actual.rows.find((r) => r.month === p.month);
                return (
                  <li key={p.id} className="group flex items-center justify-between gap-3 py-2">
                    <div>
                      <div>{monthLabel(p.month)}</div>
                      <div className="text-[12px] text-ink-soft">
                        {p.strategy === "term" ? "Reduce perioada" : "Reduce rata"}
                        {row && row.fee > 0 && ` · comision ${lei(row.fee)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="num font-medium">{lei(p.amount)}</span>
                      <button className="btn-danger px-2 opacity-60 group-hover:opacity-100" onClick={() => deletePrepayment(p)}>Șterge</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Grafic de rambursare */}
      <Panel
        title="Graficul de rambursare"
        aside={
          <div className="flex flex-wrap gap-2">
            <select className="field w-auto py-1" value={tableSource} onChange={(e) => setTableSource(e.target.value as typeof tableSource)} aria-label="Varianta">
              <option value="actual">Actual</option>
              <option value="term">Scenariu: perioadă</option>
              <option value="installment">Scenariu: rată</option>
            </select>
            <select className="field w-auto py-1" value={tableMode} onChange={(e) => setTableMode(e.target.value as typeof tableMode)} aria-label="Grupare">
              <option value="years">Pe ani</option>
              <option value="months">Pe luni</option>
            </select>
          </div>
        }
      >
        <div className="mb-6 h-[220px]">
          <ResponsiveContainer>
            <ComposedChart data={table} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid stroke="#D5DDD8" vertical={false} />
              <XAxis dataKey="label" minTickGap={20} tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={kLei} tick={{ fontSize: 12 }} />
              <Tooltip {...chartTooltipStyle} formatter={(v: number) => lei(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <RBar dataKey="interest" name="Dobândă" stackId="p" fill="#B5456A" />
              <RBar dataKey="principal" name="Principal" stackId="p" fill="#6A4E99" />
              <RBar dataKey="prepayment" name="Plată anticipată" stackId="p" fill="#C99A1E" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="num w-full min-w-[640px] text-[13px]">
            <thead className="sticky top-0 bg-sheet text-left text-ink-soft">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">{tableMode === "years" ? "An" : "Luna"}</th>
                <th className="py-2 pr-3 text-right font-medium">Dobândă</th>
                <th className="py-2 pr-3 text-right font-medium">Principal</th>
                <th className="py-2 pr-3 text-right font-medium">Anticipat</th>
                <th className="py-2 pr-3 text-right font-medium">{tableMode === "years" ? "Rata medie" : "Rata"}</th>
                <th className="py-2 pr-3 text-right font-medium">Dobânda</th>
                <th className="py-2 text-right font-medium">Sold final</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.key} className={`border-b border-line/60 ${r.key.startsWith(now.slice(0, tableMode === "years" ? 4 : 7)) ? "bg-leu-tint/60" : ""}`}>
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span>{r.label}</span>
                      {tableMode === "months" && r.key < now && (
                        <span className="rounded bg-leu-tint px-1.5 py-0.5 text-[10.5px] font-semibold text-leu border border-leu/30">
                          ✓ Achitată
                        </span>
                      )}
                      {tableMode === "months" && r.key === now && (
                        <span className="rounded bg-mov-tint px-1.5 py-0.5 text-[10.5px] font-semibold text-mov border border-mov/30">
                          În curs
                        </span>
                      )}
                      {tableMode === "years" && r.key < now.slice(0, 4) && (
                        <span className="rounded bg-leu-tint px-1.5 py-0.5 text-[10.5px] font-semibold text-leu border border-leu/30">
                          ✓ Încheiat
                        </span>
                      )}
                      {tableMode === "years" && r.key === now.slice(0, 4) && (
                        <span className="rounded bg-mov-tint px-1.5 py-0.5 text-[10.5px] font-semibold text-mov border border-mov/30">
                          An curent
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-right">{lei(r.interest)}</td>
                  <td className="py-1.5 pr-3 text-right">{lei(r.principal)}</td>
                  <td className="py-1.5 pr-3 text-right">{r.prepayment ? lei(r.prepayment) : "–"}</td>
                  <td className="py-1.5 pr-3 text-right">{lei(r.payment / r.count)}</td>
                  <td className="py-1.5 pr-3 text-right">{pct(r.rate, 2)}</td>
                  <td className="py-1.5 text-right">{lei(r.balanceEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Ajustează soldul conform băncii">
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-ink-soft leading-relaxed">
            Dacă ai făcut creditul în trecut și ai achitat deja rate sau sume anticipate, sincronizează cifrele direct cu extrasul băncii tale sau cu soldul afișat în aplicația bancară:
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sold curent rămas la bancă (lei)" hint="Datoria actuală afișată în aplicația băncii">
              <input
                className="field num font-semibold text-mov"
                type="number"
                min="0"
                step="0.01"
                value={adjCurrentBalance || ""}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  setAdjCurrentBalance(val);
                  setAdjPaidPrincipal(Math.max(0, loan.principal - val));
                }}
              />
            </Field>

            <Field label="Bani deja achitați din principal (lei)" hint="Suma cu care a scăzut datoria până acum">
              <input
                className="field num font-semibold text-leu"
                type="number"
                min="0"
                step="0.01"
                value={adjPaidPrincipal || ""}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  setAdjPaidPrincipal(val);
                  setAdjCurrentBalance(Math.max(0, loan.principal - val));
                }}
              />
            </Field>
          </div>

          <Field label="Dobândă deja achitată până acum (lei, opțional)" hint="Dacă dorești să ții evidența dobânzii plătite până acum conform extraselor">
            <input
              className="field num font-semibold"
              type="number"
              min="0"
              step="0.01"
              value={adjPaidInterest || ""}
              onChange={(e) => setAdjPaidInterest(Number(e.target.value) || 0)}
              placeholder="ex. 18500"
            />
          </Field>

          <div className="rounded-lg bg-sheet p-3 border border-line text-[13px] text-ink-soft">
            <div className="flex justify-between py-1">
              <span>Suma inițială a creditului:</span>
              <strong className="num text-ink">{lei(loan.principal)}</strong>
            </div>
            <div className="flex justify-between py-1">
              <span>Principal restituit până acum:</span>
              <strong className="num text-leu">{lei(adjPaidPrincipal)} ({loan.principal > 0 ? pct((adjPaidPrincipal / loan.principal) * 100, 1) : "0%"})</strong>
            </div>
            <div className="flex justify-between py-1">
              <span>Sold rămas de rambursat:</span>
              <strong className="num text-mov">{lei(adjCurrentBalance)}</strong>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <button className="btn-ghost" type="button" onClick={() => setAdjustOpen(false)}>
              Anulează
            </button>
            <button className="btn-primary" type="button" onClick={handleSaveAdjust} disabled={adjustSaving}>
              {adjustSaving ? "Se salvează…" : "Salvează și recalculează"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={editing} onClose={() => setEditing(false)} title="Editează creditul">
        <LoanForm
          initial={loan}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setReloadKey((k) => k + 1);
            bump();
            setToast("Creditul a fost actualizat");
          }}
        />
      </Modal>
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

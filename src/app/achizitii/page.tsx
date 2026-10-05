"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Summary } from "@/lib/analytics";
import {
  evaluateAffordability,
  type AffordabilityResult,
  type FinancialProfile,
  type FinancingType,
  type PurchasePlan,
} from "@/lib/affordability";
import { addMonths, currentMonth, lei, monthLabel, pct } from "@/lib/util";
import { Bar, Empty, Field, Modal, Money, PageHeader, Panel, Stat, Toast, useApi, useApp } from "@/components/ui";

const PRESETS = [
  { name: "Mașină", price: 45000, type: "loan" as FinancingType, down: 10000, term: 48, rate: 8.5 },
  { name: "Renovare locuință", price: 25000, type: "cash" as FinancingType, down: 0, term: 24, rate: 7.9 },
  { name: "Laptop & Birou", price: 6500, type: "cash" as FinancingType, down: 0, term: 12, rate: 9.0 },
  { name: "Electrocasnice", price: 4200, type: "cash" as FinancingType, down: 0, term: 12, rate: 8.5 },
  { name: "Vacanță / Călătorie", price: 8000, type: "cash" as FinancingType, down: 0, term: 12, rate: 9.0 },
  { name: "Avans apartament", price: 60000, type: "cash" as FinancingType, down: 0, term: 360, rate: 5.9 },
];

export default function AffordabilityPage() {
  const { month, bump, confirm } = useApp();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  // Date financiare din summary
  const { data: s } = useApi<Summary>(`/api/summary?month=${month}`);
  const { data: savedPlans, reload: refreshPlans } = useApi<PurchasePlan[]>("/api/crud/planned_purchases");

  // Stare formular simulator
  const [name, setName] = useState("Achiziție dorită");
  const [category, setCategory] = useState("Generale");
  const [totalPrice, setTotalPrice] = useState<number>(15000);
  const [financingType, setFinancingType] = useState<FinancingType>("cash");
  const [downPayment, setDownPayment] = useState<number>(3000);
  const [loanTermMonths, setLoanTermMonths] = useState<number>(36);
  const [loanInterestRate, setLoanInterestRate] = useState<number>(7.9);
  const [priority, setPriority] = useState<"ridicata" | "medie" | "scazuta">("medie");
  const [targetDate, setTargetDate] = useState<string>(addMonths(currentMonth(), 6));
  const [notes, setNotes] = useState<string>("");

  const [savingPlan, setSavingPlan] = useState(false);

  // Profil financiar compus
  const income = s?.totals.income ?? 0;
  const needs = s?.totals.needs ?? 0;
  const wants = s?.totals.wants ?? 0;
  const currentLoans = s?.totals.loanPayments ?? 0;
  const unallocated = s?.totals.unallocated ?? 0;
  const emergencySaved = s?.emergency?.saved ?? 0;
  const goalsSaved = (s?.goals ?? []).reduce((acc, g) => acc + g.saved, 0);
  const totalSavings = emergencySaved + goalsSaved;
  const monthlySavings = Math.max(0, income - (needs + wants + currentLoans));

  const profile: FinancialProfile = {
    income,
    needs,
    wants,
    currentLoanPayments: currentLoans,
    unallocated,
    totalSavings,
    emergencySaved,
    monthlySavings,
  };

  const planDraft = {
    total_price: totalPrice,
    financing_type: financingType,
    down_payment: downPayment,
    loan_term_months: loanTermMonths,
    loan_interest_rate: loanInterestRate,
  };

  const result: AffordabilityResult = evaluateAffordability(planDraft, profile);
  const { cash, loan, overallVerdict, overallScore } = result;

  // Salvare în Wishlist
  const handleSavePlan = async () => {
    if (!name.trim() || totalPrice <= 0) {
      setToast("Te rugăm să introduci o denumire și un preț valid.");
      return;
    }
    setSavingPlan(true);
    try {
      await fetch("/api/crud/planned_purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          total_price: totalPrice,
          financing_type: financingType,
          down_payment: financingType === "loan" ? downPayment : 0,
          loan_term_months: financingType === "loan" ? loanTermMonths : 0,
          loan_interest_rate: financingType === "loan" ? loanInterestRate : 0,
          target_date: targetDate,
          priority,
          notes,
          created_at: new Date().toISOString(),
        }),
      });
      refreshPlans?.();
      bump();
      setToast("Planul a fost salvat în lista ta de dorințe!");
    } catch {
      setToast("Eroare la salvarea planului.");
    } finally {
      setSavingPlan(false);
    }
  };

  // Ștergere plan
  const handleDeletePlan = async (id: number, planName: string) => {
    if (
      !(await confirm({
        title: "Ștergere plan",
        message: `Sigur dorești să ștergi „${planName}” din lista de achiziții?`,
        confirmText: "Șterge",
        danger: true,
      }))
    )
      return;

    await fetch(`/api/crud/planned_purchases?id=${id}`, { method: "DELETE" });
    refreshPlans?.();
    bump();
    setToast("Planul a fost șters.");
  };

  // Încărcare preset în simulator
  const applyPreset = (preset: typeof PRESETS[0]) => {
    setName(preset.name);
    setTotalPrice(preset.price);
    setFinancingType(preset.type);
    setDownPayment(preset.down);
    setLoanTermMonths(preset.term);
    setLoanInterestRate(preset.rate);
  };

  // Încărcare plan salvat în simulator
  const loadPlanIntoSimulator = (p: PurchasePlan) => {
    setName(p.name);
    setCategory(p.category || "Generale");
    setTotalPrice(p.total_price);
    setFinancingType(p.financing_type);
    setDownPayment(p.down_payment || 0);
    setLoanTermMonths(p.loan_term_months || 36);
    setLoanInterestRate(p.loan_interest_rate || 7.9);
    setPriority(p.priority || "medie");
    if (p.target_date) setTargetDate(p.target_date);
    if (p.notes) setNotes(p.notes);
    window.scrollTo({ top: 120, behavior: "smooth" });
    setToast(`„${p.name}” a fost încărcat în simulator.`);
  };

  // Transformare în credit real
  const handleConvertToLoan = async (p: PurchasePlan) => {
    if (
      !(await confirm({
        title: "Creare credit din achiziție",
        message: `Dorești să creezi un credit activ pentru „${p.name}” cu principal de ${lei(
          p.total_price - (p.down_payment || 0)
        )} pe ${Math.round((p.loan_term_months || 36) / 12)} ani?`,
        confirmText: "Creează creditul",
      }))
    )
      return;

    const borrowed = p.total_price - (p.down_payment || 0);
    const res = await fetch("/api/crud/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: p.name,
        bank: "Bancă nespecificată",
        principal: borrowed,
        start_date: new Date().toISOString().slice(0, 10),
        term_months: p.loan_term_months || 36,
        schedule_type: "annuity",
        fixed_rate: p.loan_interest_rate || 7.9,
        fixed_months: 36,
        margin: 2.5,
        ircc: 5.99,
        fee_fixed_pct: 0,
        fee_variable_pct: 0,
        insurance_monthly: 0,
        strategy: "term",
        active: 1,
        already_paid_principal: 0,
        already_paid_interest: 0,
      }),
    });

    const newLoan = await res.json();
    bump();
    router.push(`/credite/${newLoan.id}`);
  };

  return (
    <>
      <PageHeader
        title="Îmi permit această achiziție?"
        intro="Simulator financiar de decizie: testează orice investiție sau achiziție dorită (plată integrală vs. credit bancar) și află exact dacă ți-o permiți și cum îți schimbă venitul lunar."
        actions={
          <button className="btn-primary" onClick={handleSavePlan} disabled={savingPlan}>
            {savingPlan ? "Se salvează…" : "💾 Salvează în lista de dorințe"}
          </button>
        }
      />

      {/* 1. Profil financiar actual de bază */}
      <div className="panel mb-6 grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
        <Stat label="Venit lunar de bază" accent="var(--c-albastru)" hint="media lunii analizate">
          <Money value={income} size="lg" />
        </Stat>
        <Stat label="Bani liberi lunari" accent="var(--c-leu)" hint="cash flow net rămas">
          <Money value={unallocated} size="lg" tone={unallocated > 0 ? "leu" : "rosu"} />
        </Stat>
        <Stat
          label="Grad îndatorare actual (DTI)"
          accent="var(--c-mov)"
          hint={s?.totals.dti && s.totals.dti > 40 ? "Peste plafonul BNR" : "Sub limita legală (40%)"}
        >
          <span className="num font-display text-[24px] font-bold">
            {income > 0 ? pct((currentLoans / income) * 100, 1) : "0%"}
          </span>
        </Stat>
        <Stat
          label="Economii disponibile"
          accent="var(--c-galben)"
          hint={`acoperă ${(profile.totalSavings / Math.max(500, needs + currentLoans)).toFixed(1)} luni`}
        >
          <Money value={totalSavings} size="lg" />
        </Stat>
      </div>

      {/* 2. Simulator Principal: Formular + Card Verdict */}
      <div className="mb-6 grid gap-6 lg:grid-cols-12">
        {/* Coloana Stângă: Formular Configurare */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <Panel title="Configurare achiziție / investiție">
            {/* Preset-uri rapide */}
            <div className="mb-4">
              <label className="text-[12px] font-semibold uppercase tracking-wider text-ink-soft mb-2 block">
                Sugestii rapide de investiții:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="rounded-full border border-line bg-paper px-3 py-1 text-[12px] font-medium text-ink hover:border-albastru hover:text-albastru transition-colors"
                  >
                    {p.name} ({lei(p.price)})
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Denumire achiziție">
                <input
                  className="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex. Mașină, Laptop, Curs etc."
                  required
                />
              </Field>

              <Field label="Categorie">
                <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="Generale">Generale</option>
                  <option value="Auto & Transport">Auto & Transport</option>
                  <option value="Locuință & Mobilă">Locuință & Mobilă</option>
                  <option value="Tehnologie">Tehnologie</option>
                  <option value="Dezvoltare / Educație">Dezvoltare / Educație</option>
                  <option value="Călătorii">Călătorii</option>
                  <option value="Investiție">Investiție productivă</option>
                </select>
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Preț total al achiziției (lei)">
                <input
                  className="field num font-display text-[22px] font-bold text-ink"
                  type="number"
                  min={100}
                  step={500}
                  value={totalPrice || ""}
                  onChange={(e) => setTotalPrice(Math.max(0, Number(e.target.value) || 0))}
                />
              </Field>
            </div>

            {/* Selector Modalitate de Finanțare */}
            <div className="mt-4">
              <label className="text-[13px] font-semibold text-ink block mb-2">
                Cum intenționezi să o plătești?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFinancingType("cash")}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-center transition-all ${
                    financingType === "cash"
                      ? "border-leu bg-leu-tint text-leu font-semibold shadow-sm ring-2 ring-leu/20"
                      : "border-line bg-paper text-ink-soft hover:bg-sheet"
                  }`}
                >
                  <span className="text-[18px]">💵</span>
                  <div className="text-left">
                    <div className="text-[14px]">Plată integrală</div>
                    <div className="text-[11px] opacity-80">din economii pe loc</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFinancingType("loan")}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-center transition-all ${
                    financingType === "loan"
                      ? "border-mov bg-mov-tint text-mov font-semibold shadow-sm ring-2 ring-mov/20"
                      : "border-line bg-paper text-ink-soft hover:bg-sheet"
                  }`}
                >
                  <span className="text-[18px]">💳</span>
                  <div className="text-left">
                    <div className="text-[14px]">Credit / În rate</div>
                    <div className="text-[11px] opacity-80">împrumut bancar</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Câmpuri specifice Credit */}
            {financingType === "loan" && (
              <div className="mt-4 rounded-lg border border-mov/30 bg-mov-tint/20 p-4 flex flex-col gap-3 animate-fade">
                <div className="flex justify-between items-center text-[13px] font-semibold text-mov">
                  <span>Parametri credit</span>
                  <span>Suma împrumutată: {lei(Math.max(0, totalPrice - downPayment))}</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Avans achitat din economii (lei)">
                    <input
                      className="field num font-medium"
                      type="number"
                      min={0}
                      max={totalPrice}
                      step={500}
                      value={downPayment || ""}
                      onChange={(e) => setDownPayment(Math.min(totalPrice, Number(e.target.value) || 0))}
                    />
                    <div className="mt-1 flex gap-1">
                      {[0, 0.15, 0.25, 0.5].map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="rounded bg-paper px-2 py-0.5 text-[11px] border border-line text-ink-soft hover:text-ink"
                          onClick={() => setDownPayment(Math.round(totalPrice * p))}
                        >
                          {p * 100}%
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Durată credit (ani)">
                    <select
                      className="field font-medium"
                      value={loanTermMonths}
                      onChange={(e) => setLoanTermMonths(Number(e.target.value))}
                    >
                      <option value={12}>1 an (12 luni)</option>
                      <option value={24}>2 ani (24 luni)</option>
                      <option value={36}>3 ani (36 luni)</option>
                      <option value={60}>5 ani (60 luni)</option>
                      <option value={120}>10 ani (120 luni)</option>
                      <option value={240}>20 ani (240 luni)</option>
                      <option value={360}>30 ani (360 luni)</option>
                    </select>
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Dobândă anuală estimată (%/an)">
                    <input
                      className="field num"
                      type="number"
                      min={1}
                      max={35}
                      step={0.1}
                      value={loanInterestRate || ""}
                      onChange={(e) => setLoanInterestRate(Number(e.target.value) || 0)}
                    />
                  </Field>

                  <div className="rounded-md bg-paper p-3 border border-line flex flex-col justify-center">
                    <span className="text-[12px] text-ink-soft">Rata lunară rezultată:</span>
                    <span className="num font-display text-[18px] font-bold text-mov">
                      {lei(loan.monthlyPayment)} / lună
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-line flex justify-end">
              <button className="btn-ghost text-[13px]" onClick={handleSavePlan} disabled={savingPlan}>
                ➕ Salvează ca opțiune în lista de dorințe
              </button>
            </div>
          </Panel>
        </div>

        {/* Coloana Dreaptă: Verdict Financiar & Decizie */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <Panel
            title="Verdict financiar & Analiză de decizie"
            className={`border-2 ${
              overallVerdict === "safe"
                ? "border-leu/50 bg-leu-tint/10"
                : overallVerdict === "caution"
                ? "border-galben/60 bg-galben-tint/10"
                : "border-rosu/50 bg-rosu-tint/10"
            }`}
          >
            {/* Banner verdict mare */}
            <div
              className={`rounded-xl p-5 mb-4 ${
                overallVerdict === "safe"
                  ? "bg-leu-tint text-leu"
                  : overallVerdict === "caution"
                  ? "bg-galben-tint text-galben"
                  : "bg-rosu-tint text-rosu"
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <h3 className="font-display text-[20px] font-bold">
                  {financingType === "cash" ? cash.title : loan.title}
                </h3>
                <span className="num text-[18px] font-bold px-2.5 py-0.5 rounded-full bg-field/80 dark:bg-black/30">
                  Scor: {overallScore}/100
                </span>
              </div>
              <p className="text-[13.5px] leading-relaxed opacity-90 font-medium">
                {financingType === "cash" ? cash.advice : loan.advice}
              </p>
            </div>

            {/* Motive și argumente calculate */}
            <div className="mb-4">
              <h4 className="text-[13px] font-semibold text-ink mb-2">De ce această concluzie:</h4>
              <ul className="space-y-2 text-[13px] text-ink-soft">
                {(financingType === "cash" ? cash.reasons : loan.reasons).map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-ink font-bold mt-0.5">•</span>
                    <span className="leading-snug">{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Indicatori sintetici de impact */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-line">
              {financingType === "cash" ? (
                <>
                  <div className="rounded-lg bg-paper p-3 border border-line">
                    <div className="text-[12px] text-ink-soft">Economii după achiziție</div>
                    <div className="num font-semibold text-[17px] text-ink">{lei(cash.savingsAfter)}</div>
                    <div className="text-[11.5px] text-ink-faint">
                      din {lei(cash.savingsBefore)} inițiali
                    </div>
                  </div>

                  <div className="rounded-lg bg-paper p-3 border border-line">
                    <div className="text-[12px] text-ink-soft">Timp de refacere economii</div>
                    <div className="num font-semibold text-[17px] text-leu">
                      {cash.monthsToRecover < 900 ? `~${cash.monthsToRecover} luni` : "Nedefinit"}
                    </div>
                    <div className="text-[11.5px] text-ink-faint">la rata lunară de economii</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-paper p-3 border border-line">
                    <div className="text-[12px] text-ink-soft">Grad de îndatorare nou (DTI)</div>
                    <div
                      className={`num font-bold text-[18px] ${
                        loan.dtiAfter > 40 ? "text-rosu" : loan.dtiAfter > 25 ? "text-galben" : "text-leu"
                      }`}
                    >
                      {pct(loan.dtiAfter, 1)}
                    </div>
                    <div className="text-[11.5px] text-ink-faint">
                      {loan.dtiAfter > 40 ? "Peste plafonul legal BNR (40%)" : "În limitele BNR (max 40%)"}
                    </div>
                  </div>

                  <div className="rounded-lg bg-paper p-3 border border-line">
                    <div className="text-[12px] text-ink-soft">Bani liberi rămași / lună</div>
                    <div
                      className={`num font-semibold text-[17px] ${
                        loan.freeCashflowAfter >= 0 ? "text-ink" : "text-rosu"
                      }`}
                    >
                      {lei(loan.freeCashflowAfter)}
                    </div>
                    <div className="text-[11.5px] text-ink-faint">
                      scade cu {lei(loan.monthlyPayment)}/lună
                    </div>
                  </div>
                </>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* 3. Impactul detaliat asupra venitului și bugetului */}
      <Panel title="Cum impactează această achiziție venitul și bugetul tău" className="mb-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Card: Impactul pe Regula 50/30/20 & Venit */}
          <div className="rounded-xl border border-line bg-paper p-5">
            <h4 className="font-semibold text-[15px] text-ink mb-2">
              📊 Impactul asupra venitului tău lunar ({lei(income)})
            </h4>
            <p className="text-[13px] text-ink-soft mb-4">
              Iată cum se transformă distribuția banilor tăi dacă faci această achiziție prin{" "}
              <strong>{financingType === "cash" ? "Plată integrală" : "Credit"}</strong>:
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="font-medium text-ink">Cheltuieli esențiale + Rate (Nevoi)</span>
                  <span className="num font-semibold text-mov">
                    {financingType === "cash" ? pct(loan.needsPctBefore, 1) : pct(loan.needsPctAfter, 1)} din venit
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-line overflow-hidden">
                  <div
                    className="h-full rounded-full bg-mov transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        financingType === "cash" ? loan.needsPctBefore : loan.needsPctAfter
                      )}%`,
                    }}
                  />
                </div>
                <div className="text-[11.5px] text-ink-soft mt-1">
                  {financingType === "cash"
                    ? `${lei(needs + currentLoans)} lei/lună`
                    : `${lei(needs + currentLoans + loan.monthlyPayment)} lei/lună (+${lei(loan.monthlyPayment)} rată nouă)`}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="font-medium text-ink">Gradul de îndatorare (DTI - credite totale)</span>
                  <span
                    className={`num font-bold ${
                      (financingType === "cash" ? loan.dtiBefore : loan.dtiAfter) > 40
                        ? "text-rosu"
                        : "text-ink"
                    }`}
                  >
                    {financingType === "cash" ? pct(loan.dtiBefore, 1) : pct(loan.dtiAfter, 1)}
                  </span>
                </div>
                <div className="relative h-2.5 w-full rounded-full bg-line overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (financingType === "cash" ? loan.dtiBefore : loan.dtiAfter) > 40
                        ? "bg-rosu"
                        : (financingType === "cash" ? loan.dtiBefore : loan.dtiAfter) > 25
                        ? "bg-galben"
                        : "bg-leu"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        financingType === "cash" ? loan.dtiBefore : loan.dtiAfter
                      )}%`,
                    }}
                  />
                  {/* Marcaj plafon BNR 40% */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-rosu z-10"
                    style={{ left: "40%" }}
                    title="Plafon BNR 40%"
                  />
                </div>
                <div className="flex justify-between text-[11px] text-ink-faint mt-1">
                  <span>0%</span>
                  <span className="text-galben font-semibold">25% (Sănătos)</span>
                  <span className="text-rosu font-semibold">40% (Limita BNR)</span>
                  <span>100%</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="font-medium text-ink">Capacitatea lunară de economisire rămasă</span>
                  <span className="num font-semibold text-leu">
                    {financingType === "cash"
                      ? `${lei(monthlySavings)} / lună`
                      : `${lei(loan.savingsCapacityAfter)} / lună`}
                  </span>
                </div>
                <p className="text-[12px] text-ink-soft">
                  {financingType === "loan" && loan.monthlyPayment > 0
                    ? `Noua rată va absorbi ${lei(loan.monthlyPayment)} din banii pe care îi puneai deoparte.`
                    : "Plata integrală nu îți afectează venitul lunar viitor; continui să economisești la fel."}
                </p>
              </div>
            </div>
          </div>

          {/* Card: Comparație Directă Plată Cash vs Credit */}
          <div className="rounded-xl border border-line bg-paper p-5 flex flex-col justify-between">
            <div>
              <h4 className="font-semibold text-[15px] text-ink mb-2">
                ⚖️ Comparație directă: Plată Integrală vs Credit Bancar
              </h4>
              <p className="text-[13px] text-ink-soft mb-4">
                Vezi exact diferența de cost și de lichidități între cele două opțiuni pentru suma de{" "}
                <strong>{lei(totalPrice)}</strong>:
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Varianta Cash */}
                <div
                  className={`rounded-lg p-4 border transition-all ${
                    financingType === "cash" ? "border-leu bg-leu-tint/30 ring-1 ring-leu" : "border-line bg-sheet"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-[14px] text-ink">
                    <span>💵</span> Plată Cash
                  </div>
                  <div className="mt-3 space-y-2 text-[12.5px]">
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Preț total plătit:</span>
                      <strong className="num text-ink">{lei(totalPrice)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Dobândă suportată:</span>
                      <strong className="num text-leu">0 lei</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Impact pe economii:</span>
                      <strong className="num text-rosu">-{lei(totalPrice)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Ratǎ lunară nouă:</span>
                      <strong className="num text-ink">0 lei/lună</strong>
                    </div>
                  </div>
                </div>

                {/* Varianta Credit */}
                <div
                  className={`rounded-lg p-4 border transition-all ${
                    financingType === "loan" ? "border-mov bg-mov-tint/30 ring-1 ring-mov" : "border-line bg-sheet"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-[14px] text-ink">
                    <span>💳</span> Prin Credit
                  </div>
                  <div className="mt-3 space-y-2 text-[12.5px]">
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Cost total final:</span>
                      <strong className="num text-mov">{lei(loan.totalCost)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Dobândă în plus:</span>
                      <strong className="num text-rosu">+{lei(loan.totalInterest)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Impact inițial economii:</span>
                      <strong className="num text-ink">-{lei(downPayment)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Ratǎ lunară nouă:</span>
                      <strong className="num text-mov">{lei(loan.monthlyPayment)}/lună</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-sheet p-3 text-[12.5px] text-ink-soft border border-line">
              💡 <strong>Concluzie comparativă:</strong>{" "}
              {loan.totalInterest > 0 ? (
                <span>
                  Plata pe loc te scutește de <strong>{lei(loan.totalInterest)}</strong> plătiți băncii pe dobânzi.
                  Dacă ai fond de urgență solid, plata integrală este mai avantajoasă. Dacă ai nevoie de lichidități de
                  siguranță, creditul te ajută, dar plătești costul împrumutului.
                </span>
              ) : (
                <span>Pentru achiziții mici, plata integrală este întotdeauna opțiunea optimă.</span>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* 4. Lista de achiziții planificate / Wishlist */}
      <Panel
        title="Lista ta de achiziții dorite & investiții planificate"
        aside={
          <span className="text-[13px] text-ink-soft">
            {savedPlans?.length || 0} achiziții salvate
          </span>
        }
      >
        {!savedPlans || savedPlans.length === 0 ? (
          <Empty title="Nicio achiziție salvată încă">
            Configurează o investiție în simulatorul de mai sus și apasă pe „Salvează în lista de dorințe” pentru a-i urmări
            accesibilitatea pe măsură ce economiile tale cresc.
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedPlans.map((p) => {
              // Evaluare live pentru fiecare plan salvat
              const evalSaved = evaluateAffordability(
                {
                  total_price: p.total_price,
                  financing_type: p.financing_type,
                  down_payment: p.down_payment,
                  loan_term_months: p.loan_term_months,
                  loan_interest_rate: p.loan_interest_rate,
                },
                profile
              );

              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-line bg-paper p-4 flex flex-col justify-between hover:border-albastru transition-all shadow-sm hover:shadow"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h4 className="font-semibold text-[16px] text-ink">{p.name}</h4>
                        <span className="text-[12px] text-ink-soft">
                          {p.category} · {p.financing_type === "cash" ? "Plată cash" : "Credit"}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${
                          evalSaved.overallVerdict === "safe"
                            ? "bg-leu-tint text-leu"
                            : evalSaved.overallVerdict === "caution"
                            ? "bg-galben-tint text-galben"
                            : "bg-rosu-tint text-rosu"
                        }`}
                      >
                        {evalSaved.overallVerdict === "safe"
                          ? "✓ Accesibil"
                          : evalSaved.overallVerdict === "caution"
                          ? "⚠️ La limită"
                          : "✕ Nerecomandat"}
                      </span>
                    </div>

                    <div className="num font-display text-[22px] font-bold text-ink mb-3">
                      {lei(p.total_price)}
                    </div>

                    {p.financing_type === "loan" && (
                      <div className="text-[12px] text-ink-soft mb-2 flex justify-between">
                        <span>Rată estimată:</span>
                        <strong className="num text-mov">
                          {lei(evalSaved.loan.monthlyPayment)} / lună
                        </strong>
                      </div>
                    )}

                    {p.notes && <p className="text-[12px] text-ink-faint italic mb-3">„{p.notes}”</p>}
                  </div>

                  <div className="pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
                    <button
                      className="btn-ghost text-[12px] py-1 px-2 text-albastru"
                      onClick={() => loadPlanIntoSimulator(p)}
                    >
                      🚀 Testează
                    </button>

                    {p.financing_type === "loan" && (
                      <button
                        className="btn-ghost text-[12px] py-1 px-2 text-mov"
                        onClick={() => handleConvertToLoan(p)}
                      >
                        🏦 Creează credit
                      </button>
                    )}

                    <button
                      className="btn-danger text-[12px] py-1 px-2 opacity-60 hover:opacity-100"
                      onClick={() => p.id && handleDeletePlan(p.id, p.name)}
                    >
                      Șterge
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}


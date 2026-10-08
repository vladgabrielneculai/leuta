"use client";

import { useState } from "react";
import type { Loan } from "@/lib/loan";
import { lei, pct, termLabel } from "@/lib/util";
import { api, Field } from "./ui";

export type LoanDraft = Omit<Loan, "id">;

export const emptyLoan = (): LoanDraft => ({
  name: "Credit ipotecar",
  bank: "",
  principal: 0,
  start_date: new Date().toISOString().slice(0, 10),
  term_months: 360,
  schedule_type: "annuity",
  fixed_rate: 0,
  fixed_months: 36,
  margin: 0,
  ircc: 0,
  fee_fixed_pct: 1,
  fee_variable_pct: 0,
  insurance_monthly: 0,
  strategy: "term",
  active: 1,
  already_paid_principal: 0,
  already_paid_interest: 0,
  pad_amount: 0,
  pad_due_date: "",
  opt_ins_amount: 0,
  opt_ins_due_date: "",
});

export default function LoanForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Loan;
  onSaved: (l: Loan) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<LoanDraft>(initial ?? emptyLoan());
  const [years, setYears] = useState(String(+((initial?.term_months ?? 360) / 12).toFixed(2)));
  const [fixedYears, setFixedYears] = useState(String(+((initial?.fixed_months ?? 36) / 12).toFixed(2)));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasStartedInPast, setHasStartedInPast] = useState<boolean>(
    Boolean(
      (initial?.already_paid_principal && initial.already_paid_principal > 0) ||
      (initial?.start_date && initial.start_date.slice(0, 7) < new Date().toISOString().slice(0, 7))
    )
  );

  const set = <K extends keyof LoanDraft>(k: K, v: LoanDraft[K]) => setD({ ...d, [k]: v });
  const n = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));
  // Anii pot avea zecimale (ex. 28,33 ani); creditul se calculează pe luni întregi.
  const monthsOf = (v: string) => Math.round(n(v) * 12);
  const monthsHint = (v: string) => (monthsOf(v) > 0 ? `= ${termLabel(monthsOf(v))} (${monthsOf(v)} rate)` : undefined);

  const submit = async () => {
    setErr(null);
    const term = monthsOf(years);
    const fixed = monthsOf(fixedYears);
    if (d.principal <= 0) return setErr("Introdu suma împrumutată.");
    if (term <= 0) return setErr("Perioada trebuie să fie mai mare decât zero.");
    if (fixed > term) return setErr("Perioada fixă nu poate depăși durata creditului.");
    setBusy(true);
    try {
      const body = { ...d, term_months: term, fixed_months: fixed };
      const saved = initial
        ? await api<Loan>("/api/crud/loans", "PUT", { id: initial.id, ...body })
        : await api<Loan>("/api/crud/loans", "POST", body);
      onSaved(saved);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <Field label="Nume">
          <input className="field" value={d.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Banca">
          <input className="field" value={d.bank} onChange={(e) => set("bank", e.target.value)} />
        </Field>
        <Field label="Suma împrumutată (lei)">
          <input className="field num" type="number" min="0" step="0.01" value={d.principal || ""} onChange={(e) => set("principal", n(e.target.value))} required />
        </Field>
        <Field label="Data acordării" hint="Prima rată se consideră în luna următoare">
          <input className="field" type="date" value={d.start_date} onChange={(e) => set("start_date", e.target.value)} required />
        </Field>
        <Field label="Durata (ani)" hint={monthsHint(years) ?? "Poți scrie și zecimale, ex. 28,33"}>
          <input className="field num" type="number" min="0.08" step="any" inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} required />
        </Field>
        <Field label="Tipul ratelor" hint="Verifică în graficul de rambursare de la bancă">
          <select className="field" value={d.schedule_type} onChange={(e) => set("schedule_type", e.target.value as LoanDraft["schedule_type"])}>
            <option value="annuity">Egale (anuități)</option>
            <option value="declining">Descrescătoare</option>
          </select>
        </Field>
      </fieldset>

      <fieldset className="rounded-md border border-mov/40 bg-mov-tint/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <legend className="px-1 text-[14px] font-semibold text-mov flex items-center gap-1.5">
            <span>💰</span> Bani deja plătiți / Situația la zi
          </legend>
          <label className="flex items-center gap-2 text-[13px] font-medium text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={hasStartedInPast}
              onChange={(e) => {
                setHasStartedInPast(e.target.checked);
                if (!e.target.checked) {
                  set("already_paid_principal", 0);
                  set("already_paid_interest", 0);
                }
              }}
              className="accent-mov h-4 w-4 rounded"
            />
            <span>Am plătit deja bani din acest credit</span>
          </label>
        </div>

        {hasStartedInPast ? (
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-[12.5px] text-ink-soft leading-relaxed">
              Dacă ai făcut creditul în trecut (anul trecut sau anterior) și ai plătit deja rate sau sume anticipate, introdu aici cât ai achitat sau soldul rămas actual de pe extrasul băncii:
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Bani deja achitați din principal (lei)"
                hint="Suma cu care a scăzut datoria până în prezent"
              >
                <input
                  className="field num font-semibold text-leu"
                  type="number"
                  min="0"
                  step="0.01"
                  value={d.already_paid_principal || ""}
                  onChange={(e) => set("already_paid_principal", n(e.target.value))}
                  placeholder="ex. 35000"
                />
              </Field>

              <Field
                label="Sold curent rămas la bancă (lei)"
                hint="Dacă îl cunoști direct din aplicația băncii"
              >
                <input
                  className="field num font-semibold text-mov"
                  type="number"
                  min="0"
                  step="0.01"
                  value={d.principal > 0 ? Math.max(0, d.principal - (d.already_paid_principal || 0)) || "" : ""}
                  onChange={(e) => {
                    const currentBalance = n(e.target.value);
                    if (d.principal > 0) {
                      set("already_paid_principal", Math.max(0, d.principal - currentBalance));
                    }
                  }}
                  placeholder="ex. 265000"
                />
              </Field>

              <Field
                label="Dobândă deja plătită până acum (opțional, lei)"
                hint="Totalul dobânzilor achitate în ratele anterioare"
              >
                <input
                  className="field num"
                  type="number"
                  min="0"
                  step="0.01"
                  value={d.already_paid_interest || ""}
                  onChange={(e) => set("already_paid_interest", n(e.target.value))}
                  placeholder="ex. 18500"
                />
              </Field>

              <div className="flex flex-col justify-center rounded-lg bg-paper p-3 border border-line text-[12px] text-ink-soft">
                <div className="font-semibold text-ink mb-0.5">Rezumat situație credit:</div>
                {d.principal > 0 && (d.already_paid_principal || 0) > 0 ? (
                  <div>
                    Ai achitat <span className="font-bold text-leu">{lei(d.already_paid_principal || 0)}</span> (
                    {pct(((d.already_paid_principal || 0) / d.principal) * 100, 1)}) din creditul inițial de {lei(d.principal)}.
                    Soldul curent de rambursat: <span className="font-bold text-mov">{lei(Math.max(0, d.principal - (d.already_paid_principal || 0)))}</span>.
                  </div>
                ) : (
                  <div>
                    Aplicația va estima plățile din trecut conform datei acordării ({d.start_date}). Poți introduce oricând suma exactă plătită.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-soft">
            Bifează căsuța de mai sus dacă ai contractat creditul în trecut și dorești să introduci direct banii deja achitați sau soldul curent rămas.
          </p>
        )}
      </fieldset>

      <fieldset className="rounded-md border border-line p-4">
        <legend className="px-1 text-[14px] font-medium">Dobânda</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dobândă fixă (% pe an)">
            <input className="field num" type="number" min="0" step="0.01" value={d.fixed_rate || ""} onChange={(e) => set("fixed_rate", n(e.target.value))} />
          </Field>
          <Field label="Perioada fixă (ani)" hint={monthsHint(fixedYears) ?? "0 dacă e variabilă de la început"}>
            <input className="field num" type="number" min="0" step="any" inputMode="decimal" value={fixedYears} onChange={(e) => setFixedYears(e.target.value)} />
          </Field>
          <Field label="Marja băncii (%)">
            <input className="field num" type="number" min="0" step="0.01" value={d.margin || ""} onChange={(e) => set("margin", n(e.target.value))} />
          </Field>
          <Field label="IRCC actual (%)" hint="Publicat trimestrial de BNR">
            <input className="field num" type="number" min="0" step="0.01" value={d.ircc || ""} onChange={(e) => set("ircc", n(e.target.value))} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-line p-4">
        <legend className="px-1 text-[14px] font-medium">Costuri și plăți anticipate</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Comision în perioada fixă (%)">
            <input className="field num" type="number" min="0" step="0.01" inputMode="decimal" value={d.fee_fixed_pct} onChange={(e) => set("fee_fixed_pct", n(e.target.value))} />
          </Field>
          <Field label="Comision în perioada variabilă (%)">
            <input className="field num" type="number" min="0" step="0.01" inputMode="decimal" value={d.fee_variable_pct} onChange={(e) => set("fee_variable_pct", n(e.target.value))} />
          </Field>
          <Field
            label="Asigurări lunare (lei)"
            hint={Number(d.use_schedule) === 1 ? "Cu graficul băncii activ se iau costurile din grafic" : "Se adaugă la rata lunară"}
          >
            <input className="field num" type="number" min="0" step="0.01" value={d.insurance_monthly || ""} onChange={(e) => set("insurance_monthly", n(e.target.value))} />
          </Field>
          <Field label="Asigurare PAD (lei/an)" hint="Plătită o dată pe an">
            <input className="field num" type="number" min="0" step="0.01" value={d.pad_amount || ""} onChange={(e) => set("pad_amount", n(e.target.value))} />
          </Field>
          <Field label="Scadența PAD" hint="Luna din fiecare an în care se plătește">
            <input className="field" type="date" value={d.pad_due_date ?? ""} onChange={(e) => set("pad_due_date", e.target.value)} />
          </Field>
          <Field label="Asigurare facultativă (lei/an)" hint="Lasă gol dacă nu ai">
            <input className="field num" type="number" min="0" step="0.01" value={d.opt_ins_amount || ""} onChange={(e) => set("opt_ins_amount", n(e.target.value))} />
          </Field>
          <Field label="Scadența asigurării facultative">
            <input className="field" type="date" value={d.opt_ins_due_date ?? ""} onChange={(e) => set("opt_ins_due_date", e.target.value)} />
          </Field>
          <Field label="Efectul implicit al plăților anticipate">
            <select className="field" value={d.strategy} onChange={(e) => set("strategy", e.target.value as LoanDraft["strategy"])}>
              <option value="term">Reducerea perioadei</option>
              <option value="installment">Reducerea ratei</option>
            </select>
          </Field>
        </div>
      </fieldset>

      {err && <p className="text-[13px] text-rosu">{err}</p>}
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>Renunță</button>
        <button type="submit" className="btn-primary" disabled={busy}>{initial ? "Salvează creditul" : "Adaugă creditul"}</button>
      </div>
    </form>
  );
}

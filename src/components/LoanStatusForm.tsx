"use client";

import { useMemo, useState } from "react";
import { scheduleFromStatus, type Loan, type LoanStatusInput, type ScheduleRow } from "@/lib/loan";
import { lei, monthLabel } from "@/lib/util";
import { Field } from "./ui";

export type LoanStatusDraft = LoanStatusInput & {
  arrears_amount: number;
  arrears_count: number;
  pad_amount: number;
  pad_due_date: string;
  opt_ins_amount: number;
  opt_ins_due_date: string;
};

/**
 * „Situația la zi” copiată din aplicația băncii (George BCR: sumă restantă, următoarea rată,
 * principal, dobândă, taxe lunare, maturitate, restanțe, rata dobânzii, asigurări anuale).
 * Din ea se reconstruiește graficul de rambursare până la maturitate.
 */
export default function LoanStatusForm({
  loan,
  busy,
  onSave,
}: {
  loan: Loan;
  busy?: boolean;
  onSave: (draft: LoanStatusDraft, rows: ScheduleRow[]) => void;
}) {
  const [d, setD] = useState<LoanStatusDraft>({
    current_balance: loan.current_balance || 0,
    next_payment_date: loan.next_payment_date || "",
    next_payment_amount: loan.next_payment_amount || 0,
    next_principal: loan.next_principal || 0,
    next_interest: loan.next_interest || 0,
    next_fees: loan.next_fees || 0,
    maturity_date: loan.maturity_date || "",
    current_rate: loan.current_rate || loan.fixed_rate || 0,
    arrears_amount: loan.arrears_amount || 0,
    arrears_count: loan.arrears_count || 0,
    pad_amount: loan.pad_amount || 0,
    pad_due_date: loan.pad_due_date || "",
    opt_ins_amount: loan.opt_ins_amount || 0,
    opt_ins_due_date: loan.opt_ins_due_date || "",
  });
  const set = <K extends keyof LoanStatusDraft>(k: K, v: LoanStatusDraft[K]) => setD({ ...d, [k]: v });
  const n = (v: string) => (v === "" ? 0 : Number(v));

  // Valoarea ratei = principal + dobândă + taxe; o completăm singuri dacă lipsește.
  const sumParts = d.next_principal + d.next_interest + d.next_fees;
  const partsMismatch = d.next_payment_amount > 0 && sumParts > 0 && Math.abs(sumParts - d.next_payment_amount) > 0.05;

  const preview = useMemo(() => {
    try {
      const rows = scheduleFromStatus(loan, { ...d, next_payment_amount: d.next_payment_amount || sumParts });
      return { rows, error: null as string | null };
    } catch (e) {
      return { rows: [] as ScheduleRow[], error: e instanceof Error ? e.message : "Date incomplete" };
    }
  }, [loan, d, sumParts]);

  const rows = preview.rows;
  const interestLeft = rows.reduce((s, r) => s + r.interest, 0);
  const jump = rows.find((r, i) => i > 1 && rows[i - 1].payment > 0 && Math.abs(r.payment - rows[i - 1].payment) / rows[i - 1].payment > 0.05 && i < rows.length - 1);

  const money = (k: keyof LoanStatusDraft, label: string, hint?: string, placeholder?: string) => (
    <Field label={label} hint={hint}>
      <input className="field num" type="number" min="0" step="0.01" value={(d[k] as number) || ""} placeholder={placeholder ?? "0"}
        onChange={(e) => set(k, n(e.target.value) as never)} />
    </Field>
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (rows.length) onSave({ ...d, next_payment_amount: d.next_payment_amount || sumParts }, rows);
      }}
    >
      <p className="text-[13px] text-ink-soft">
        Copiază datele din aplicația băncii (în George: detaliile creditului). Din ele reconstruiesc graficul de rambursare până
        la maturitate, cu rate egale pe soldul rămas.
      </p>

      <fieldset className="grid grid-cols-2 gap-3">
        {money("current_balance", "Sold curent (credit actual)", "Lasă gol și îl estimez din rată și maturitate", "ex. 195316,76")}
        <Field label="Rata dobânzii (% pe an)">
          <input className="field num" type="number" min="0" step="0.01" value={d.current_rate || ""} onChange={(e) => set("current_rate", n(e.target.value))} required />
        </Field>
        <Field label="Data următoarei rate">
          <input className="field" type="date" value={d.next_payment_date} onChange={(e) => set("next_payment_date", e.target.value)} required />
        </Field>
        {money("next_payment_amount", "Valoarea următoarei rate", "Principal + dobândă + taxe lunare")}
        {money("next_principal", "Principal")}
        {money("next_interest", "Dobândă")}
        {money("next_fees", "Taxe lunare", "Asigurarea de viață credite garantate etc.")}
        <Field label="Maturitate" hint="Data ultimei rate">
          <input className="field" type="date" value={d.maturity_date} onChange={(e) => set("maturity_date", e.target.value)} required />
        </Field>
        {money("arrears_amount", "Suma restantă", "Se adaugă la plata din luna curentă")}
        <Field label="Restanțe (nr. rate)">
          <input className="field num" type="number" min="0" step="1" value={d.arrears_count || ""} placeholder="0" onChange={(e) => set("arrears_count", Math.round(n(e.target.value)))} />
        </Field>
      </fieldset>

      <fieldset className="rounded-md border border-line p-4">
        <legend className="px-1 text-[14px] font-medium">Asigurări anuale</legend>
        <div className="grid grid-cols-2 gap-3">
          {money("pad_amount", "Asigurare PAD (lei/an)")}
          <Field label="Scadența PAD">
            <input className="field" type="date" value={d.pad_due_date} onChange={(e) => set("pad_due_date", e.target.value)} />
          </Field>
          {money("opt_ins_amount", "Asigurare facultativă (lei/an)", "Lasă 0 dacă nu ai")}
          <Field label="Scadența asigurării facultative">
            <input className="field" type="date" value={d.opt_ins_due_date} onChange={(e) => set("opt_ins_due_date", e.target.value)} />
          </Field>
        </div>
      </fieldset>

      {partsMismatch && (
        <p className="rounded-md bg-galben-tint p-2 text-[12.5px]">
          Principal + dobândă + taxe = {lei(sumParts, true)}, diferit de valoarea ratei ({lei(d.next_payment_amount, true)}). Verifică cifrele.
        </p>
      )}

      {rows.length > 0 ? (
        <div className="rounded-lg border border-leu/40 bg-leu-tint/20 p-3 text-[13px]">
          <div className="font-semibold text-ink">
            Grafic reconstruit: {rows.length} rate, {monthLabel(rows[0].month)} – {monthLabel(rows[rows.length - 1].month)}
          </div>
          <div className="mt-1 text-ink-soft">
            Sold {d.current_balance > 0 ? "" : "estimat "}<span className="num font-medium text-ink">{lei(rows[0].balance_start, true)}</span> ·
            rata obișnuită <span className="num font-medium text-ink">{lei(rows[Math.min(1, rows.length - 1)].payment, true)}</span> ·
            dobândă rămasă <span className="num font-medium text-ink">{lei(interestLeft)}</span>
          </div>
          {jump && (
            <div className="mt-1 text-ink-soft">
              După perioada fixă (din {monthLabel(jump.month)}) rata devine <span className="num font-medium text-ink">{lei(jump.payment, true)}</span>.
            </div>
          )}
        </div>
      ) : (
        preview.error && <p className="text-[13px] text-ink-soft">{preview.error}</p>
      )}

      <button type="submit" className="btn-primary w-full justify-center py-2.5 text-[14px] font-semibold" disabled={busy || rows.length === 0}>
        {busy ? "Se salvează…" : "Salvează situația și reconstruiește graficul"}
      </button>
    </form>
  );
}

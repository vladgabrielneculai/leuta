"use client";

import { useState } from "react";
import { installmentsLeft, minPayment, monthlyInterest, planInstallments, utilization, type CardDebt } from "@/lib/debts";
import type { ScheduleView } from "@/lib/scheduledServer";
import { currentMonth, lei, monthLabel, parseAmount, pct } from "@/lib/util";
import { api, Bar, Field, Modal, Panel, Toast, useApi, useApp } from "./ui";

type Category = { id: number; name: string; kind: string };
type DebtDraft = { id?: number; name: string; kind: "card" | "overdraft"; credit_limit: string; balance: string; rate: string; min_payment_pct: string; min_payment_amount: string; due_day: string };
type BnplDraft = { name: string; total: string; n: string; start: string; day: string; category_id: string };

const num = (s: string) => parseAmount(s) || 0;

/**
 * Carduri de credit, descoperit de cont și cumpărături în rate, pe pagina Credite.
 * Ratele (BNPL) sunt programări cu lună de sfârșit: intră singure în buget lună de lună.
 */
export default function CardDebts({
  debts,
  installments,
  reload,
}: {
  debts: CardDebt[];
  installments: ScheduleView[];
  reload: () => void;
}) {
  const { bump, confirm } = useApp();
  const { data: cats } = useApi<Category[]>("/api/crud/categories");
  const [d, setD] = useState<DebtDraft | null>(null);
  const [b, setB] = useState<BnplDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const done = (msg: string) => {
    reload();
    bump();
    setToast(msg);
  };

  const saveDebt = async () => {
    if (!d) return;
    setErr(null);
    const body = {
      name: d.name,
      kind: d.kind,
      credit_limit: num(d.credit_limit),
      balance: num(d.balance),
      balance_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date()),
      rate: num(d.rate),
      min_payment_pct: num(d.min_payment_pct),
      min_payment_amount: num(d.min_payment_amount),
      due_day: d.due_day ? Number(d.due_day) : null,
      active: 1,
    };
    try {
      if (d.id) await api("/api/crud/debts", "PUT", { id: d.id, ...body });
      else await api("/api/crud/debts", "POST", body);
      setD(null);
      done(d.id ? "Card salvat" : "Card adăugat");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const removeDebt = async (id: number, name: string) => {
    if (!(await confirm({ title: "Ștergere", message: `Ștergi „${name}”? Intrările din buget nu sunt atinse.`, confirmText: "Șterge", danger: true }))) return;
    await api(`/api/crud/debts?id=${id}`, "DELETE");
    setD(null);
    done("Șters");
  };
  const saveBnpl = async () => {
    if (!b) return;
    setErr(null);
    try {
      const plan = planInstallments(num(b.total), Number(b.n), b.start);
      await api("/api/scheduled", "POST", {
        name: b.name.trim(),
        category_id: Number(b.category_id),
        amount: plan.amount,
        currency: "RON",
        frequency: "monthly",
        day: Number(b.day) || 1,
        start_month: b.start,
        end_month: plan.end_month,
        is_subscription: false,
      });
      setB(null);
      done(`${b.name}: ${b.n} rate de ${lei(plan.amount)}, până în ${monthLabel(plan.end_month)}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const active = debts.filter((x) => x.active);
  const bnpl = installments.filter((s) => s.active && s.end_month && s.kind !== "income").map((s) => ({ s, ...installmentsLeft({ ...s, end_month: s.end_month! }) })).filter((x) => x.count > 0);
  const expenseCats = (cats ?? []).filter((c) => c.kind === "variable" || c.kind === "fixed");
  const plan = b && num(b.total) > 0 && Number(b.n) >= 2 ? (() => { try { return planInstallments(num(b.total), Number(b.n), b.start); } catch { return null; } })() : null;

  return (
    <Panel
      className="mt-6"
      title="Carduri, descoperit și rate"
      aside={
        <div className="flex gap-2">
          <button className="btn-ghost px-2 text-[13px]" onClick={() => { setErr(null); setB({ name: "", total: "", n: "6", start: currentMonth(), day: "15", category_id: "" }); }}>+ Rate</button>
          <button className="btn-ghost px-2 text-[13px]" onClick={() => { setErr(null); setD({ name: "", kind: "card", credit_limit: "", balance: "", rate: "", min_payment_pct: "5", min_payment_amount: "50", due_day: "" }); }}>+ Card</button>
        </div>
      }
    >
      {active.length === 0 && bnpl.length === 0 ? (
        <p className="text-[14px] text-ink-soft">
          Ai un card de credit, descoperit de cont sau cumperi în rate (inclusiv „rate fără dobândă”)? Adaugă-le aici ca să vezi tot ce datorezi și să intre în strategia de rambursare.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {active.map((x) => {
            const min = minPayment(x);
            const used = utilization(x);
            return (
              <button
                key={x.id}
                type="button"
                className="rounded-md border border-line p-3 text-left hover:border-mov"
                onClick={() => {
                  setErr(null);
                  setD({ id: x.id, name: x.name, kind: x.kind, credit_limit: String(x.credit_limit), balance: String(x.balance), rate: String(x.rate), min_payment_pct: String(x.min_payment_pct), min_payment_amount: String(x.min_payment_amount), due_day: x.due_day ? String(x.due_day) : "" });
                }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{x.name} <span className="text-[12px] font-normal text-ink-faint">{x.kind === "card" ? "card de credit" : "descoperit de cont"}</span></span>
                  <span className="num font-semibold text-mov">{lei(x.balance)}</span>
                </div>
                {x.credit_limit > 0 && <div className="mt-2"><Bar value={Math.min(100, used)} color={used > 80 ? "var(--c-rosu)" : "var(--c-mov)"} /></div>}
                <dl className="num mt-2 grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-4">
                  <div><dt className="text-ink-soft">Limită folosită</dt><dd>{x.credit_limit > 0 ? `${pct(used, 0)} din ${lei(x.credit_limit)}` : "–"}</dd></div>
                  <div><dt className="text-ink-soft">Plata minimă</dt><dd>{lei(min)}{x.due_day ? ` pe ${x.due_day}` : ""}</dd></div>
                  <div><dt className="text-ink-soft">Dobândă / lună</dt><dd className={monthlyInterest(x) > 0 ? "text-rosu" : ""}>{lei(monthlyInterest(x))}</dd></div>
                  <div><dt className="text-ink-soft">Dobânda</dt><dd>{pct(x.rate, 2)} pe an</dd></div>
                </dl>
              </button>
            );
          })}
          {bnpl.length > 0 && (
            <div>
              <h3 className="mb-1 text-[14px] font-semibold">Cumpărături în rate</h3>
              <ul className="flex flex-col divide-y divide-line/60 text-[14px]">
                {bnpl.map(({ s, count, left }) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      {s.name}
                      <span className="block text-[12px] text-ink-faint">{count} rate de {lei(s.amount)} · ultima în {monthLabel(s.end_month!)}</span>
                    </span>
                    <span className="num shrink-0 font-medium">{lei(left)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[12px] text-ink-faint">Ratele intră singure în buget lună de lună. Le modifici din Abonamente.</p>
            </div>
          )}
        </div>
      )}

      <Modal open={!!d} onClose={() => setD(null)} title={d?.id ? "Modifică" : "Card de credit sau descoperit"}>
        {d && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveDebt(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nume"><input className="field" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="ex. Card BT Star" required /></Field>
              <Field label="Tip">
                <select className="field" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as DebtDraft["kind"] })}>
                  <option value="card">Card de credit</option>
                  <option value="overdraft">Descoperit de cont</option>
                </select>
              </Field>
              <Field label="Cât datorezi acum (lei)"><input className="field num" inputMode="decimal" value={d.balance} onChange={(e) => setD({ ...d, balance: e.target.value })} required /></Field>
              <Field label="Limita (lei)"><input className="field num" inputMode="decimal" value={d.credit_limit} onChange={(e) => setD({ ...d, credit_limit: e.target.value })} /></Field>
              <Field label="Dobânda anuală (%)" hint="Din extrasul cardului; 0 dacă plătești în perioada de grație"><input className="field num" inputMode="decimal" value={d.rate} onChange={(e) => setD({ ...d, rate: e.target.value })} /></Field>
              <Field label="Ziua scadenței"><input className="field num" inputMode="numeric" value={d.due_day} onChange={(e) => setD({ ...d, due_day: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="ex. 25" /></Field>
              <Field label="Plata minimă (% din sold)"><input className="field num" inputMode="decimal" value={d.min_payment_pct} onChange={(e) => setD({ ...d, min_payment_pct: e.target.value })} /></Field>
              <Field label="Plata minimă, cel puțin (lei)"><input className="field num" inputMode="decimal" value={d.min_payment_amount} onChange={(e) => setD({ ...d, min_payment_amount: e.target.value })} /></Field>
            </div>
            {err && <p className="text-[13px] text-rosu" role="alert">{err}</p>}
            <div className="form-actions sm:justify-between">
              {d.id ? <button type="button" className="btn-danger" onClick={() => removeDebt(d.id!, d.name)}>Șterge</button> : <span className="hidden sm:block" />}
              <div className="flex gap-2 *:flex-1 sm:*:flex-none">
                <button type="button" className="btn-ghost" onClick={() => setD(null)}>Renunță</button>
                <button type="submit" className="btn-primary">Salvează</button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!b} onClose={() => setB(null)} title="Cumpărătură în rate">
        {b && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveBnpl(); }}>
            <Field label="Ce ai cumpărat"><input className="field" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} placeholder="ex. Telefon eMAG" required /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prețul total (lei)"><input className="field num" inputMode="decimal" value={b.total} onChange={(e) => setB({ ...b, total: e.target.value })} required /></Field>
              <Field label="Număr de rate"><input className="field num" inputMode="numeric" value={b.n} onChange={(e) => setB({ ...b, n: e.target.value.replace(/\D/g, "").slice(0, 2) })} required /></Field>
              <Field label="Prima rată în luna"><input className="field" type="month" value={b.start} onChange={(e) => setB({ ...b, start: e.target.value })} required /></Field>
              <Field label="Ziua ratei"><input className="field num" inputMode="numeric" value={b.day} onChange={(e) => setB({ ...b, day: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></Field>
            </div>
            <Field label="Categoria">
              <select className="field" value={b.category_id} onChange={(e) => setB({ ...b, category_id: e.target.value })} required>
                <option value="">Alege categoria…</option>
                {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            {plan && <p className="text-[13px] text-ink-soft">{b.n} rate de ≈ {lei(plan.amount)}, ultima în {monthLabel(plan.end_month)}. Fiecare rată intră în buget în luna ei.</p>}
            {err && <p className="text-[13px] text-rosu" role="alert">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setB(null)}>Renunță</button>
              <button type="submit" className="btn-primary">Adaugă ratele</button>
            </div>
          </form>
        )}
      </Modal>
      <Toast message={toast} onDone={() => setToast(null)} />
    </Panel>
  );
}

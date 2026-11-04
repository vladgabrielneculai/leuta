"use client";

import { useState } from "react";
import { ACCOUNT_KINDS, type AccountBalance, type AccountKind, type Transfer } from "@/lib/accounts";
import { eur, lei, parseAmount } from "@/lib/util";
import StartingBalances, { signedAmount, todayRo } from "@/components/StartingBalances";
import { api, Empty, Field, Modal, Money, PageHeader, Panel, Skeleton, Stat, STAT_STRIP, Toast, useApi, useApp } from "@/components/ui";

type Overview = { accounts: AccountBalance[]; total: number; transfers: Transfer[]; eurRate: number };

type AccountDraft = { id?: number; name: string; kind: AccountKind; currency: "RON" | "EUR"; opening_balance: string; opening_date: string };
type TransferDraft = { from: string; to: string; amount: string; to_amount: string; date: string; note: string };

const fmtDay = (d: string) => d.split("-").reverse().join(".");
const money = (n: number, c: string) => (c === "EUR" ? eur(n) : lei(n));
const kindLabel = (k: string) => ACCOUNT_KINDS.find((x) => x.kind === k)?.label ?? k;

/**
 * Conturile (beta): numerar, cont curent, economii, card, fiecare cu soldul lui, și transferurile dintre ele.
 * Transferul mută bani între conturile tale: nu e cheltuială și nu schimbă bugetul lunii.
 */
export default function AccountsPage() {
  const { bump, confirm } = useApp();
  const { data, error, reload } = useApi<Overview>("/api/accounts");
  const [acc, setAcc] = useState<AccountDraft | null>(null);
  const [tr, setTr] = useState<TransferDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (error && /nu există/i.test(error)) return <Empty title="Pagina nu există">Conturile sunt disponibile doar în versiunea beta.</Empty>;

  const done = (msg: string) => {
    reload();
    bump();
    setToast(msg);
  };
  const active = data?.accounts.filter((a) => !a.archived) ?? [];
  const archived = data?.accounts.filter((a) => a.archived) ?? [];
  const byId = new Map((data?.accounts ?? []).map((a) => [a.id, a]));

  const saveAccount = async () => {
    if (!acc) return;
    setErr(null);
    const body = { name: acc.name, kind: acc.kind, currency: acc.currency, opening_balance: signedAmount(acc.opening_balance), opening_date: acc.opening_date };
    try {
      if (acc.id) await api("/api/crud/accounts", "PUT", { id: acc.id, ...body });
      else await api("/api/crud/accounts", "POST", { ...body, archived: 0 });
      setAcc(null);
      done(acc.id ? "Cont salvat" : "Cont adăugat");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const archive = async (a: AccountBalance) => {
    await api("/api/crud/accounts", "PUT", { id: a.id, archived: a.archived ? 0 : 1 });
    setAcc(null);
    done(a.archived ? "Cont reactivat" : "Cont arhivat");
  };
  const saveTransfer = async () => {
    if (!tr) return;
    setErr(null);
    const from = byId.get(Number(tr.from));
    const to = byId.get(Number(tr.to));
    const differ = !!from && !!to && from.currency !== to.currency;
    try {
      await api("/api/crud/transfers", "POST", {
        from_account_id: Number(tr.from),
        to_account_id: Number(tr.to),
        amount: parseAmount(tr.amount),
        to_amount: differ ? parseAmount(tr.to_amount) : null,
        date: tr.date,
        note: tr.note,
      });
      setTr(null);
      done("Transfer salvat");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const removeTransfer = async (t: Transfer) => {
    if (!(await confirm({ title: "Ștergere transfer", message: `Ștergi transferul din ${fmtDay(t.date)}? Soldurile celor două conturi se recalculează.`, confirmText: "Șterge", danger: true }))) return;
    await api(`/api/crud/transfers?id=${t.id}`, "DELETE");
    done("Transfer șters");
  };

  const trFrom = tr ? byId.get(Number(tr.from)) : undefined;
  const trTo = tr ? byId.get(Number(tr.to)) : undefined;

  return (
    <>
      <PageHeader
        title="Conturi"
        intro="Unde stau banii: numerar, cont curent, economii, card. Intrările trecute pe un cont îi schimbă soldul; transferurile mută bani între conturi fără să fie cheltuieli."
        actions={
          <>
            <button
              className="btn-ghost"
              disabled={active.length < 2}
              onClick={() => {
                setErr(null);
                setTr({ from: String(active[0]?.id ?? ""), to: String(active[1]?.id ?? ""), amount: "", to_amount: "", date: todayRo(), note: "" });
              }}
            >
              Transfer
            </button>
            <button className="btn-primary" onClick={() => { setErr(null); setAcc({ name: "", kind: "current", currency: "RON", opening_balance: "", opening_date: todayRo() }); }}>
              Adaugă cont
            </button>
          </>
        }
      />

      {!data ? (
        error ? <p className="rounded-md bg-rosu-tint p-3 text-[13px] text-rosu" role="alert">{error}</p> : <Skeleton />
      ) : data.accounts.length === 0 ? (
        <Panel title="Soldurile de azi">
          <StartingBalances onSaved={() => done("Conturi adăugate")} />
        </Panel>
      ) : (
        <>
          <div className={`panel mb-6 ${STAT_STRIP}`}>
            <Stat label="Total în conturi" accent="var(--c-leu)" hint={`${active.length} conturi active`}>
              <Money value={data.total} rate={data.eurRate} size="lg" tone={data.total >= 0 ? undefined : "rosu"} />
            </Stat>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((a) => (
              <button
                key={a.id}
                type="button"
                className="panel p-4 text-left transition-colors hover:border-leu"
                onClick={() => {
                  setErr(null);
                  setAcc({ id: a.id, name: a.name, kind: a.kind, currency: a.currency === "EUR" ? "EUR" : "RON", opening_balance: String(a.opening_balance).replace(".", ","), opening_date: a.opening_date });
                }}
              >
                <span className="block text-[12px] uppercase tracking-wide text-ink-faint">{kindLabel(a.kind)}</span>
                <span className="block text-[17px] font-semibold">{a.name}</span>
                <span className={`num mt-2 block text-[24px] font-semibold ${a.balance < 0 ? "text-rosu" : ""}`}>{money(a.balance, a.currency)}</span>
                <span className="mt-1 block text-[12px] text-ink-soft">
                  pornit cu {money(a.opening_balance, a.currency)} la {fmtDay(a.opening_date)} · {a.entries} intrări
                </span>
              </button>
            ))}
          </div>

          <Panel title="Transferuri" summary={`${data.transfers.length} transferuri`}>
            {data.transfers.length === 0 ? (
              <p className="text-[14px] text-ink-soft">
                Când muți bani între conturi (retragi numerar, pui în contul de economii), trece-i ca transfer: soldurile se schimbă, bugetul lunii nu.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-line/60">
                {data.transfers.map((t) => {
                  const f = byId.get(t.from_account_id);
                  const to = byId.get(t.to_account_id);
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2 text-[14px]">
                      <span className="min-w-0 flex-1">
                        {f?.name ?? "?"} → {to?.name ?? "?"}
                        <span className="block text-[12px] text-ink-faint">{[fmtDay(t.date), t.note].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="num shrink-0 text-right font-medium">
                        {money(Number(t.amount), f?.currency ?? "RON")}
                        {t.to_amount !== null && <span className="block text-[12px] font-normal text-ink-soft">= {money(Number(t.to_amount), to?.currency ?? "RON")}</span>}
                      </span>
                      <button className="btn-ghost px-2 text-[13px] text-rosu" onClick={() => removeTransfer(t)} aria-label="Șterge transferul">Șterge</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {archived.length > 0 && (
            <Panel className="mt-6" title="Arhivate">
              <ul className="flex flex-col gap-1 text-[14px]">
                {archived.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <span>{a.name} <span className="text-ink-faint">· {money(a.balance, a.currency)}</span></span>
                    <button className="btn-ghost px-2 text-[13px]" onClick={() => archive(a)}>Reactivează</button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      <Modal open={!!acc} onClose={() => setAcc(null)} title={acc?.id ? "Modifică contul" : "Cont nou"}>
        {acc && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveAccount(); }}>
            <Field label="Nume">
              <input className="field" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} placeholder="ex. ING, Revolut, Portofel" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tip">
                <select className="field" value={acc.kind} onChange={(e) => setAcc({ ...acc, kind: e.target.value as AccountKind })}>
                  {ACCOUNT_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                </select>
              </Field>
              <Field label="Moneda">
                <select className="field" value={acc.currency} onChange={(e) => setAcc({ ...acc, currency: e.target.value as "RON" | "EUR" })}>
                  <option value="RON">lei</option>
                  <option value="EUR">euro</option>
                </select>
              </Field>
              <Field label="Sold de pornire" hint="Poate fi negativ (descoperit de cont)">
                <input className="field num" inputMode="decimal" value={acc.opening_balance} onChange={(e) => setAcc({ ...acc, opening_balance: e.target.value.replace(/[^\d.,-]/g, "") })} placeholder="0,00" />
              </Field>
              <Field label="La data" hint="Intrările de la această zi încolo schimbă soldul">
                <input className="field" type="date" value={acc.opening_date} onChange={(e) => setAcc({ ...acc, opening_date: e.target.value })} required />
              </Field>
            </div>
            {err && <p className="text-[13px] text-rosu" role="alert">{err}</p>}
            <div className="form-actions sm:justify-between">
              {acc.id ? (
                <button type="button" className="btn-ghost border border-line" onClick={() => archive(byId.get(acc.id!)!)}>
                  {byId.get(acc.id)?.archived ? "Reactivează" : "Arhivează"}
                </button>
              ) : <span className="hidden sm:block" />}
              <div className="flex gap-2 *:flex-1 sm:*:flex-none">
                <button type="button" className="btn-ghost" onClick={() => setAcc(null)}>Renunță</button>
                <button type="submit" className="btn-primary">{acc.id ? "Salvează" : "Adaugă"}</button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!tr} onClose={() => setTr(null)} title="Transfer între conturi">
        {tr && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveTransfer(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Din contul">
                <select className="field" value={tr.from} onChange={(e) => setTr({ ...tr, from: e.target.value })}>
                  {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="În contul">
                <select className="field" value={tr.to} onChange={(e) => setTr({ ...tr, to: e.target.value })}>
                  {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label={`Suma (${trFrom?.currency === "EUR" ? "€" : "lei"})`}>
                <input className="field num" inputMode="decimal" value={tr.amount} onChange={(e) => setTr({ ...tr, amount: e.target.value.replace(/[^\d.,]/g, "") })} placeholder="0,00" required />
              </Field>
              {trFrom && trTo && trFrom.currency !== trTo.currency && (
                <Field label={`Ajung (${trTo.currency === "EUR" ? "€" : "lei"})`} hint="Suma după schimbul valutar">
                  <input className="field num" inputMode="decimal" value={tr.to_amount} onChange={(e) => setTr({ ...tr, to_amount: e.target.value.replace(/[^\d.,]/g, "") })} required />
                </Field>
              )}
              <Field label="Data">
                <input className="field" type="date" value={tr.date} onChange={(e) => setTr({ ...tr, date: e.target.value })} required />
              </Field>
              <Field label="Notă (opțional)">
                <input className="field" value={tr.note} onChange={(e) => setTr({ ...tr, note: e.target.value })} placeholder="ex. retragere bancomat" />
              </Field>
            </div>
            {err && <p className="text-[13px] text-rosu" role="alert">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setTr(null)}>Renunță</button>
              <button type="submit" className="btn-primary">Salvează</button>
            </div>
          </form>
        )}
      </Modal>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

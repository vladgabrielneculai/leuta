"use client";

import { useState } from "react";
import type { AccountKind } from "@/lib/accounts";
import { parseAmount } from "@/lib/util";
import { api } from "./ui";

/** Rândurile propuse: conturile pe care le are aproape oricine. */
const STARTER: { name: string; kind: AccountKind }[] = [
  { name: "Cont curent", kind: "current" },
  { name: "Numerar", kind: "cash" },
  { name: "Cont de economii", kind: "savings" },
];

export const todayRo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());

/** Sumă cu semn: „-250” e un sold negativ (descoperit de cont). */
export function signedAmount(raw: string) {
  const neg = raw.trim().startsWith("-");
  const v = parseAmount(raw.replace(/-/g, "")) || 0;
  return neg ? -v : v;
}

/**
 * Soldurile de azi, pentru mai multe conturi deodată (beta): în Conturi, când nu ai încă niciunul, și în ghidul
 * de început. Rândurile lăsate goale nu se salvează.
 */
export default function StartingBalances({ onSaved, intro = true }: { onSaved: () => void; intro?: boolean }) {
  const [rows, setRows] = useState(STARTER.map((a) => ({ ...a, currency: "RON" as "RON" | "EUR", amount: "" })));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = async () => {
    const filled = rows.filter((r) => r.name.trim() && r.amount.trim() !== "");
    if (!filled.length) return setErr("Completează soldul la cel puțin un cont.");
    setBusy(true);
    setErr(null);
    try {
      await api("/api/accounts", "POST", {
        date: todayRo(),
        accounts: filled.map((r) => ({ name: r.name.trim(), kind: r.kind, currency: r.currency, opening_balance: signedAmount(r.amount) })),
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {intro && <p className="text-[14px] text-ink-soft">Cât ai azi în fiecare loc? Lasă gol ce nu ai. De acum, intrările trecute pe un cont îi schimbă soldul.</p>}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_7.5rem_3.5rem] items-center gap-2">
          <input className="field" value={r.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Numele contului" placeholder="ex. Revolut" />
          <input className="field num" inputMode="decimal" placeholder="0,00" value={r.amount} onChange={(e) => set(i, { amount: e.target.value.replace(/[^\d.,-]/g, "") })} aria-label={`Soldul de azi pentru ${r.name || "cont"}`} />
          <button type="button" className="btn-ghost border border-line px-2 text-[13px]" onClick={() => set(i, { currency: r.currency === "RON" ? "EUR" : "RON" })} aria-label={`Moneda: ${r.currency === "RON" ? "lei" : "euro"}`}>
            {r.currency === "RON" ? "lei" : "€"}
          </button>
        </div>
      ))}
      <button type="button" className="self-start text-[13px] text-albastru underline" onClick={() => setRows([...rows, { name: "", kind: "other", currency: "RON", amount: "" }])}>
        + Alt cont
      </button>
      {err && <p className="text-[13px] text-rosu" role="alert">{err}</p>}
      <button type="button" className="btn-primary self-start" onClick={save} disabled={busy}>
        {busy ? "Se salvează…" : "Salvează soldurile"}
      </button>
    </div>
  );
}

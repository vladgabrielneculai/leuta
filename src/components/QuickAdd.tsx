"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { lei, eur, monthLabel, type Currency, type Kind } from "@/lib/util";
import { api, Modal, Toast, useApi, useApp } from "./ui";

/**
 * Adăugarea rapidă, din butonul „+” al barei de jos (pe telefon): suma întâi, apoi categoria dintr-o atingere.
 * Aceeași fereastră editează și șterge o intrare existentă (atingi rândul din „Luna curentă”).
 * Intrarea se trece în luna analizată, cea din bara de sus.
 */

type Category = { id: number; name: string; kind: Kind; color: string };
type Goal = { id: number; name: string };
type Investment = { id: number; name: string };
export type QuickEntry = {
  id: number;
  kind: Kind;
  category_id: number | null;
  goal_id: number | null;
  investment_id: number | null;
  description: string;
  amount: number;
  currency: Currency;
  recurring: number;
};

type OpenArgs = { kind?: Kind; entry?: QuickEntry };
const QuickAddCtx = createContext<(args?: OpenArgs) => void>(() => undefined);

/** Deschide fereastra de adăugare (opțional cu tipul ales) sau de editare a unei intrări. */
export function useQuickAdd() {
  return useContext(QuickAddCtx);
}

const KINDS: { kind: Kind; label: string; color: string }[] = [
  { kind: "variable", label: "Cheltuială", color: "var(--c-rosu)" },
  { kind: "income", label: "Venit", color: "var(--c-leu)" },
  { kind: "fixed", label: "Cost fix", color: "var(--c-albastru)" },
  { kind: "saving", label: "Economii", color: "var(--c-galben)" },
];

/** „1.234,50”, „1234.5” sau „45,5” devin număr; altceva dă NaN. */
export function parseAmount(raw: string) {
  let s = raw.replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  return /^\d*\.?\d+$|^\d+\.$/.test(s) ? Number(s) : NaN;
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenArgs | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const open = useCallback((args: OpenArgs = {}) => {
    setToast(null); // mesajul precedent nu rămâne peste fereastră
    setState(args);
  }, []);
  return (
    <QuickAddCtx.Provider value={open}>
      {children}
      {state && <QuickAddSheet key={state.entry?.id ?? state.kind ?? "nou"} args={state} onClose={() => setState(null)} onDone={setToast} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </QuickAddCtx.Provider>
  );
}

function QuickAddSheet({ args, onClose, onDone }: { args: OpenArgs; onClose: () => void; onDone: (msg: string) => void }) {
  const { month, bump, confirm, eurRate } = useApp();
  const editing = args.entry;
  const [kind, setKind] = useState<Kind>(editing?.kind ?? args.kind ?? "variable");
  const [amount, setAmount] = useState(editing ? (Number.isInteger(editing.amount) ? String(editing.amount) : editing.amount.toFixed(2).replace(".", ",")) : "");
  const [currency, setCurrency] = useState<Currency>(editing?.currency ?? "RON");
  const [categoryId, setCategoryId] = useState<number | null>(editing?.category_id ?? null);
  const [dest, setDest] = useState(editing?.goal_id ? `g:${editing.goal_id}` : editing?.investment_id ? `i:${editing.investment_id}` : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [recurring, setRecurring] = useState(!!editing?.recurring);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const { data: cats } = useApi<Category[]>("/api/crud/categories");
  const { data: goals } = useApi<Goal[]>("/api/crud/goals");
  const { data: invs } = useApi<Investment[]>("/api/crud/investments");
  const { data: settings } = useApi<Record<string, string>>("/api/settings");
  const investments = settings?.enable_investments === "1" ? invs ?? [] : [];

  const kindCats = (cats ?? []).filter((c) => c.kind === kind);
  const value = parseAmount(amount);

  // Suma e primul lucru de completat: tastatura numerică apare imediat (doar la adăugare).
  useEffect(() => {
    if (!editing) amountRef.current?.focus();
  }, [editing]);

  const changeKind = (k: Kind) => {
    setKind(k);
    setCategoryId(null);
    setErr(null);
  };

  const submit = async () => {
    if (!(value > 0)) {
      setErr("Scrie o sumă mai mare decât 0.");
      amountRef.current?.focus();
      return;
    }
    if (kind !== "saving" && !categoryId) {
      setErr("Alege o categorie.");
      return;
    }
    const catName = kind === "saving" ? null : kindCats.find((c) => c.id === categoryId)?.name;
    const payload = {
      month: editing ? undefined : month,
      kind,
      category_id: kind === "saving" ? kindCats[0]?.id ?? null : categoryId,
      goal_id: kind === "saving" && dest.startsWith("g:") ? Number(dest.slice(2)) : null,
      investment_id: kind === "saving" && dest.startsWith("i:") ? Number(dest.slice(2)) : null,
      description: description.trim(),
      amount: value,
      currency,
      recurring: recurring ? 1 : 0,
    };
    setBusy(true);
    try {
      if (editing) {
        await api("/api/crud/entries", "PUT", { id: editing.id, ...payload });
        onDone("Modificare salvată");
      } else {
        await api("/api/crud/entries", "POST", payload);
        const what = catName ?? (kind === "saving" ? "Economii" : "Intrare");
        onDone(`${what}: ${currency === "EUR" ? eur(value) : lei(value)} trecut în ${monthLabel(month)}`);
      }
      bump();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const name = editing.description || kindCats.find((c) => c.id === editing.category_id)?.name || "această intrare";
    if (!(await confirm({ title: "Ștergere intrare", message: `Sigur dorești să ștergi „${name}” (${lei(editing.amount)})?`, confirmText: "Șterge", danger: true }))) return;
    try {
      await api(`/api/crud/entries?id=${editing.id}`, "DELETE");
      bump();
      onDone("Intrare ștearsă");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const chip = (on: boolean) =>
    `flex min-h-[40px] items-center gap-2 rounded-md border px-3 py-1.5 text-left text-[14px] transition-colors active:scale-[0.98] ${
      on ? "border-ink bg-ink text-sheet" : "border-line-strong/70 bg-field text-ink"
    }`;

  return (
    <Modal open onClose={onClose} title={editing ? "Modifică intrarea" : `Adaugă în ${monthLabel(month)}`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* Tipul intrării: cheltuiala e cea mai des folosită, deci prima. */}
        <div className="grid grid-cols-4 gap-1 rounded-md border border-line bg-paper p-1" role="radiogroup" aria-label="Tip">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => changeKind(k.kind)}
              className={`flex min-h-[40px] flex-col items-center justify-center rounded-[4px] px-1 text-[12.5px] font-medium leading-tight transition-colors ${
                kind === k.kind ? "bg-sheet text-ink shadow-[0_1px_2px_rgb(var(--shadow)/0.15)]" : "text-ink-soft"
              }`}
            >
              <span className="mb-1 h-1 w-6 rounded-full" style={{ background: k.color, opacity: kind === k.kind ? 1 : 0.45 }} aria-hidden />
              {k.label}
            </button>
          ))}
        </div>

        <div>
          <div className="flex items-stretch gap-2">
            <input
              ref={amountRef}
              className="field num min-w-0 flex-1 !py-3 !text-[26px] font-semibold"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              placeholder="0,00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^\d.,\s]/g, ""));
                setErr(null);
              }}
              aria-label="Sumă"
            />
            <div className="grid shrink-0 grid-rows-2 gap-1" role="radiogroup" aria-label="Monedă">
              {(["RON", "EUR"] as Currency[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={currency === c}
                  onClick={() => setCurrency(c)}
                  className={`w-16 rounded-md border text-[13px] font-semibold ${currency === c ? "border-ink bg-ink text-sheet" : "border-line-strong/70 bg-field text-ink-soft"}`}
                >
                  {c === "RON" ? "lei" : "€"}
                </button>
              ))}
            </div>
          </div>
          {currency === "EUR" && value > 0 && <p className="mt-1 text-right text-[12px] text-ink-faint num">≈ {lei(value * eurRate)}</p>}
        </div>

        <div>
          <span className="label">{kind === "saving" ? "Unde merg banii" : "Categoria"}</span>
          {kind === "saving" ? (
            <div className="flex flex-wrap gap-1.5">
              {[{ v: "", name: "Economii generale" }, ...(goals ?? []).map((g) => ({ v: `g:${g.id}`, name: g.name })), ...investments.map((i) => ({ v: `i:${i.id}`, name: i.name }))].map((d) => (
                <button key={d.v} type="button" className={chip(dest === d.v)} aria-pressed={dest === d.v} onClick={() => setDest(d.v)}>
                  {d.name}
                </button>
              ))}
            </div>
          ) : !cats ? (
            <p className="text-[13px] text-ink-faint">Se încarcă…</p>
          ) : kindCats.length === 0 ? (
            <p className="text-[13px] text-ink-soft">Nu ai categorii pentru acest tip. Le poți adăuga din Setări.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {kindCats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={chip(categoryId === c.id)}
                  aria-pressed={categoryId === c.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    setErr(null);
                  }}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} aria-hidden />
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          className="field"
          placeholder="Descriere (opțional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Descriere"
        />

        <label className="flex min-h-[40px] items-center gap-2.5 text-[14px] text-ink-soft" title="Se poate copia în luna următoare">
          <input type="checkbox" className="h-[18px] w-[18px] shrink-0" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          <span>Se repetă lunar</span>
        </label>

        {err && <p className="text-[13px] text-rosu" role="alert">{err}</p>}

        {/* Butoanele rămân la vedere chiar dacă lista de categorii e lungă. */}
        <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-dashed border-line-strong bg-sheet px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0">
          {editing && (
            <button type="button" className="btn-danger border border-rosu/30 px-4" onClick={remove}>
              Șterge
            </button>
          )}
          <button type="submit" className="btn-primary flex-1 py-3 text-[15px]" disabled={busy}>
            {busy ? "Se salvează…" : editing ? "Salvează" : "Adaugă"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

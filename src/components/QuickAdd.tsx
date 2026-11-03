"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { budgetMonthOf, budgetMonthRange, CALENDAR_CYCLE, cycleActive, defaultDayIn, rangeLabel, type PayCycle } from "@/lib/payCycle";
import { addMonths, lei, eur, monthLabel, parseAmount, type Currency, type Kind } from "@/lib/util";
import { activeTrip, type TripListItem } from "@/lib/trips";
import { api, Modal, Skeleton, Toast, useApi, useApp, useIsMobile } from "./ui";
import { TripExpenseForm } from "./Trips";

/**
 * Adăugarea rapidă, din butonul „+” al barei de jos (pe telefon): suma întâi, apoi categoria dintr-o atingere.
 * Aceeași fereastră editează și șterge o intrare existentă (atingi rândul din „Luna curentă”).
 * Intrarea se trece în luna analizată, cea din bara de sus. Cât timp ești în vacanță, fereastra are și
 * varianta „Vacanță”: cheltuiala merge la vacanța în curs, în moneda ei, nu în bugetul lunar.
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
  month?: string;
  created_at?: string | null;
};

/** Ziua locală YYYY-MM-DD a unui moment. */
export function dayOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Data propusă pentru o intrare nouă în luna analizată: azi, dacă e luna curentă; altfel ultima sau prima zi a ei. */
function defaultDay(month: string, cycle: PayCycle) {
  return defaultDayIn(month, cycle, dayOf(new Date()));
}

/**
 * Data unei intrări existente; dacă ziua salvată nu cade în luna intrării (trecută mai târziu), prima zi a lunii.
 * Cu luna de la salariu, „în luna intrării” înseamnă între salariul acelei luni și următorul.
 */
export function entryDay(entry: QuickEntry, cycle: PayCycle = CALENDAR_CYCLE) {
  const saved = entry.created_at ? dayOf(new Date(entry.created_at)) : null;
  if (saved && (!entry.month || budgetMonthOf(saved, cycle) === entry.month)) return saved;
  return entry.month ? budgetMonthRange(entry.month, cycle).start : dayOf(new Date());
}

/** Pune înapoi o intrare ștearsă (butonul „Anulează”): aceeași lună, dată și sumă, cu un id nou. */
export async function restoreEntry(e: QuickEntry, cycle: PayCycle = CALENDAR_CYCLE) {
  await api("/api/crud/entries", "POST", {
    month: e.month,
    created_at: entryDay(e, cycle),
    kind: e.kind,
    category_id: e.category_id,
    goal_id: e.goal_id,
    investment_id: e.investment_id,
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    recurring: e.recurring,
  });
}

type OpenArgs = { kind?: Kind; entry?: QuickEntry; /** deschide direct varianta pentru vacanța în curs */ trip?: boolean };
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

/** Mesajul de după salvare; cu `undo`, mesajul are butonul „Anulează” (pe telefon, după ștergere). */
type Done = { text: string; undo?: () => void };

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenArgs | null>(null);
  const [toast, setToast] = useState<Done | null>(null);
  const open = useCallback((args: OpenArgs = {}) => {
    setToast(null); // mesajul precedent nu rămâne peste fereastră
    setState(args);
  }, []);
  const clearToast = useCallback(() => setToast(null), []);
  // Scurtătura din iconița aplicației (manifest.ts) deschide direct adăugarea: /?add=1 (sau /?add=income etc. pentru un tip anume).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const add = params.get("add");
    if (add === null) return;
    params.delete("add");
    const rest = params.toString();
    history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
    open(KINDS.some((k) => k.kind === add) ? { kind: add as Kind } : {});
  }, [open]);
  const undo = toast?.undo;
  return (
    <QuickAddCtx.Provider value={open}>
      {children}
      {state && (
        <QuickAddSheet
          key={state.entry?.id ?? state.kind ?? (state.trip ? "vacanta" : "nou")}
          args={state}
          onClose={() => setState(null)}
          onDone={(text, u) => setToast({ text, undo: u })}
        />
      )}
      <Toast
        message={toast?.text ?? null}
        onDone={clearToast}
        action={
          undo
            ? {
                label: "Anulează",
                onClick: () => {
                  setToast(null);
                  undo();
                },
              }
            : undefined
        }
      />
    </QuickAddCtx.Provider>
  );
}

/** O vibrație scurtă la salvare (doar telefoanele care o permit, ex. Android; iPhone o ignoră). */
function tick() {
  try {
    navigator.vibrate?.(12);
  } catch {}
}

/** Câte categorii apar pe telefon înainte de „Altele”: cele mai folosite, ca alegerea să fie dintr-o privire. */
const TOP_CATEGORIES = 6;

function QuickAddSheet({ args, onClose, onDone }: { args: OpenArgs; onClose: () => void; onDone: (msg: string, undo?: () => void) => void }) {
  const { month, bump, confirm, eurRate, beta, cycle } = useApp();
  const mobile = useIsMobile();
  const editing = args.entry;
  const [kind, setKind] = useState<Kind>(editing?.kind ?? args.kind ?? "variable");
  // Returul (bani înapoi) e salvat ca sumă negativă la aceeași categorie; în formular apare suma pozitivă și bifa.
  const startAmount = editing ? Math.abs(editing.amount) : 0;
  const [amount, setAmount] = useState(editing ? (Number.isInteger(startAmount) ? String(startAmount) : startAmount.toFixed(2).replace(".", ",")) : "");
  const [refund, setRefund] = useState(!!editing && editing.amount < 0);
  const [currency, setCurrency] = useState<Currency>(editing?.currency ?? "RON");
  const [categoryId, setCategoryId] = useState<number | null>(editing?.category_id ?? null);
  const [dest, setDest] = useState(editing?.goal_id ? `g:${editing.goal_id}` : editing?.investment_id ? `i:${editing.investment_id}` : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [recurring, setRecurring] = useState(!!editing?.recurring);
  // Ziua tranzacției: o folosește importul extrasului ca să recunoască intrările trecute deja de mână.
  const [date, setDate] = useState(editing ? entryDay(editing, cycle) : defaultDay(month, cycle));
  const [dateTouched, setDateTouched] = useState(false);
  // Luna în care intră: a datei alese sau, cu luna de la salariu, luna salariului din care se plătește.
  const targetMonth = /^\d{4}-\d{2}-\d{2}$/.test(date) ? budgetMonthOf(date, cycle) : date.slice(0, 7);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  // Vacanța în curs (doar la adăugare): implicit cheltuiala merge acolo, cu comutator înapoi la luna curentă.
  const { data: trips, error: tripsError } = useApi<TripListItem[]>(editing ? null : "/api/trips");
  const trip = trips ? activeTrip(trips) : null;
  const [forTrip, setForTrip] = useState(args.trip ?? !args.kind);
  const tripMode = !!trip && forTrip;
  // Deschisă explicit pentru vacanță: până se încarcă vacanțele nu arătăm formularul lunar.
  const waitingTrip = !!args.trip && !editing && !trips && !tripsError;
  // Ai început să completezi înainte să se încarce vacanțele: rămâi pe bugetul lunii.
  const stayMonthly = () => {
    if (!trips && !args.trip) setForTrip(false);
  };

  const { data: cats } = useApi<Category[]>("/api/crud/categories");
  const { data: goals } = useApi<Goal[]>("/api/crud/goals");
  const { data: invs } = useApi<Investment[]>("/api/crud/investments");
  const { data: settings } = useApi<Record<string, string>>("/api/settings");
  const investments = settings?.enable_investments === "1" ? invs ?? [] : [];

  // Pe telefon, categoriile sunt ordonate după cât de des le folosești (intrările din luna analizată și din cele două dinainte).
  // Tot de aici aflăm dacă folosești euro: dacă nu, alegerea monedei stă în „Detalii”.
  const m1 = addMonths(month, -1);
  const m2 = addMonths(month, -2);
  const { data: h0 } = useApi<QuickEntry[]>(mobile ? `/api/crud/entries?month=${month}` : null);
  const { data: h1 } = useApi<QuickEntry[]>(mobile ? `/api/crud/entries?month=${m1}` : null);
  const { data: h2 } = useApi<QuickEntry[]>(mobile ? `/api/crud/entries?month=${m2}` : null);
  const history = [...(h0 ?? []), ...(h1 ?? []), ...(h2 ?? [])];
  const uses = new Map<number, number>();
  for (const e of history) if (e.category_id) uses.set(e.category_id, (uses.get(e.category_id) ?? 0) + 1);
  const usesEur = history.some((e) => e.currency === "EUR");

  const kindCats = (cats ?? []).filter((c) => c.kind === kind);
  // Sortare stabilă: la egalitate rămâne ordinea alfabetică de pe server.
  const sortedCats = mobile ? [...kindCats].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0)) : kindCats;
  const [allCats, setAllCats] = useState(false);
  const hiddenCats = mobile && !allCats ? Math.max(0, sortedCats.length - TOP_CATEGORIES) : 0;
  // Categoria aleasă rămâne la vedere chiar dacă nu e printre cele mai folosite.
  const shownCats = hiddenCats
    ? sortedCats.filter((c, i) => i < TOP_CATEGORIES || c.id === categoryId)
    : sortedCats;
  // Pe telefon, data, descrierea, moneda și bifele stau strânse în „Detalii”; la modificare sunt deschise.
  const [detailsOpen, setDetailsOpen] = useState(!!editing);
  const compact = mobile && !detailsOpen;
  const showCurrency = !mobile || usesEur || currency === "EUR" || detailsOpen;
  // Returul are sens doar la cheltuieli; o intrare deja salvată ca retur rămâne editabilă și în afara versiunii beta.
  const canRefund = (kind === "variable" || kind === "fixed") && (beta || refund);
  const value = parseAmount(amount);

  // Suma e primul lucru de completat: tastatura numerică apare imediat (doar la adăugare).
  useEffect(() => {
    if (!editing && !tripMode && !waitingTrip) amountRef.current?.focus();
  }, [editing, tripMode, waitingTrip]);

  const changeKind = (k: Kind) => {
    stayMonthly();
    setKind(k);
    setCategoryId(null);
    if (k === "income" || k === "saving") setRefund(false);
    setErr(null);
  };

  const submit = async (pick?: { categoryId?: number; dest?: string }) => {
    const categoryId_ = pick?.categoryId ?? categoryId;
    const dest_ = pick?.dest ?? dest;
    if (!(value > 0)) {
      setErr("Scrie o sumă mai mare decât 0.");
      amountRef.current?.focus();
      return;
    }
    if (kind !== "saving" && !categoryId_) {
      setErr("Alege o categorie.");
      return;
    }
    const catName = kind === "saving" ? null : kindCats.find((c) => c.id === categoryId_)?.name;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErr("Alege data.");
      return;
    }
    // La modificare, data și luna se schimbă doar dacă ai ales altă dată.
    const dated = !editing || dateTouched;
    const payload = {
      month: dated ? targetMonth : undefined,
      created_at: dated ? date : undefined,
      kind,
      category_id: kind === "saving" ? kindCats[0]?.id ?? null : categoryId_,
      goal_id: kind === "saving" && dest_.startsWith("g:") ? Number(dest_.slice(2)) : null,
      investment_id: kind === "saving" && dest_.startsWith("i:") ? Number(dest_.slice(2)) : null,
      description: description.trim(),
      amount: canRefund && refund ? -value : value,
      currency,
      recurring: recurring ? 1 : 0,
    };
    setBusy(true);
    try {
      if (editing) {
        await api("/api/crud/entries", "PUT", { id: editing.id, ...payload });
        onDone("Modificare salvată");
        if (mobile) tick();
      } else {
        await api("/api/crud/entries", "POST", payload);
        const what = catName ?? (kind === "saving" ? "Economii" : "Intrare");
        const sum = currency === "EUR" ? eur(value) : lei(value);
        if (mobile) tick();
        onDone(canRefund && refund ? `Retur ${what}: ${sum} scăzut din ${monthLabel(targetMonth)}` : `${what}: ${sum} trecut în ${monthLabel(targetMonth)}`);
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
    // Pe telefon nu mai cerem confirmarea: ștergem imediat și oferim „Anulează” în mesajul de jos.
    if (!mobile && !(await confirm({ title: "Ștergere intrare", message: `Sigur dorești să ștergi „${name}” (${lei(editing.amount)})?`, confirmText: "Șterge", danger: true }))) return;
    try {
      await api(`/api/crud/entries?id=${editing.id}`, "DELETE");
      bump();
      const restore = async () => {
        try {
          await restoreEntry(editing, cycle);
          bump();
          onDone("Intrarea a fost pusă înapoi");
        } catch (e) {
          onDone((e as Error).message);
        }
      };
      onDone(mobile ? `Șters: ${name}` : "Intrare ștearsă", mobile ? restore : undefined);
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
    <Modal open onClose={onClose} title={editing ? "Modifică intrarea" : tripMode || waitingTrip ? `Cheltuială de vacanță` : `Adaugă în ${monthLabel(/^\d{4}-\d{2}$/.test(targetMonth) ? targetMonth : month)}`}>
      {trip && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-md border border-line bg-paper p-1" role="radiogroup" aria-label="Unde se trece">
          {[
            { on: false, label: `Bugetul lunii`, hint: monthLabel(month).replace(/^./, (c) => c.toUpperCase()) },
            { on: true, label: `🧳 Vacanță`, hint: trip.name },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={forTrip === o.on}
              onClick={() => setForTrip(o.on)}
              className={`flex min-h-[44px] min-w-0 flex-col items-center justify-center rounded-[4px] px-2 text-[13px] font-medium leading-tight transition-colors ${
                forTrip === o.on ? "bg-sheet text-ink shadow-[0_1px_2px_rgb(var(--shadow)/0.15)]" : "text-ink-soft"
              }`}
            >
              {o.label}
              <span className="mt-0.5 w-full truncate text-center text-[11px] font-normal text-ink-faint">{o.hint}</span>
            </button>
          ))}
        </div>
      )}
      {waitingTrip ? (
        <Skeleton variant="block" />
      ) : tripMode ? (
        <TripExpenseForm
          trip={trip}
          currencies={Object.keys(trip.funds)}
          onSaved={(msg) => {
            bump();
            onDone(msg);
            onClose();
          }}
        />
      ) : (
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
                className="field num min-w-0 flex-1 py-3! text-[26px]! font-semibold"
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                placeholder="0,00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d.,\s]/g, ""));
                  setErr(null);
                  stayMonthly();
                }}
                aria-label="Sumă"
              />
              {showCurrency && (
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
              )}
            </div>
            {currency === "EUR" && value > 0 && <p className="mt-1 text-right text-[12px] text-ink-faint num">≈ {lei(value * eurRate)}</p>}
          </div>

          <div>
            <span className="label">
              {kind === "saving" ? "Unde merg banii" : "Categoria"}
              {compact && !editing && <span className="ml-1.5 font-normal text-ink-faint">· atinge ca să salvezi</span>}
            </span>
            {kind === "saving" ? (
              <div className="flex flex-wrap gap-1.5">
                {[{ v: "", name: "Economii generale" }, ...(goals ?? []).map((g) => ({ v: `g:${g.id}`, name: g.name })), ...investments.map((i) => ({ v: `i:${i.id}`, name: i.name }))].map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    className={chip(dest === d.v)}
                    aria-pressed={dest === d.v}
                    disabled={busy}
                    onClick={() => {
                      setDest(d.v);
                      if (compact && !editing && value > 0) submit({ dest: d.v });
                    }}
                  >
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
                {shownCats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={chip(categoryId === c.id)}
                    aria-pressed={categoryId === c.id}
                    disabled={busy}
                    onClick={() => {
                      stayMonthly();
                      setCategoryId(c.id);
                      setErr(null);
                      // Pe telefon, cu suma scrisă și detaliile strânse, atingerea categoriei salvează direct.
                      if (compact && !editing && value > 0) submit({ categoryId: c.id });
                    }}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: c.color }} aria-hidden />
                    {c.name}
                  </button>
                ))}
                {hiddenCats > 0 && (
                  <button type="button" className={`${chip(false)} border-dashed text-ink-soft`} onClick={() => setAllCats(true)}>
                    Altele ({hiddenCats})…
                  </button>
                )}
              </div>
            )}
          </div>

          {compact ? (
            // Pe telefon, rândul „Detalii” spune ce se va salva (azi, fără descriere) și se deschide doar dacă vrei altceva.
            <button
              type="button"
              className="-mt-1 flex min-h-[44px] items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 text-left text-[13.5px] text-ink-soft active:bg-sheet"
              onClick={() => setDetailsOpen(true)}
              aria-expanded={false}
            >
              <span className="min-w-0 truncate">
                <span className="font-medium text-ink">Detalii</span>
                <span className="mx-1.5 text-ink-faint">·</span>
                {[
                  date === dayOf(new Date()) ? "azi" : date.split("-").reverse().join("."),
                  description.trim() || "fără descriere",
                  recurring ? "lunar" : null,
                  refund && canRefund ? "retur" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="shrink-0 text-ink-faint" aria-hidden>›</span>
            </button>
          ) : (
            <>
            <label className="flex items-center gap-3">
              <span className="label mb-0! shrink-0">Data</span>
              <input
                type="date"
                className="field min-w-0 flex-1"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateTouched(true);
                  setErr(null);
                }}
                aria-label="Data tranzacției"
              />
            </label>
            {!editing && targetMonth !== month && /^\d{4}-\d{2}/.test(targetMonth) && (
              <p className="-mt-2 text-[12px] text-ink-faint">
                Se trece în {monthLabel(targetMonth)}
                {cycleActive(cycle) ? `, luna salariului din care se plătește (${rangeLabel(targetMonth, cycle)}).` : ", luna datei alese."}
              </p>
            )}
  
            <input
              className="field"
              placeholder="Descriere (opțional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Descriere"
            />
  
            {canRefund && (
              <label className="-mt-1 flex min-h-[40px] items-center gap-2.5 text-[14px] text-ink-soft" title="Scade din cheltuielile categoriei, nu se adună la venituri">
                <input type="checkbox" className="h-[18px] w-[18px] shrink-0" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
                <span>Bani înapoi (retur, rambursare): scade din {kindCats.find((c) => c.id === categoryId)?.name ?? "categorie"}</span>
              </label>
            )}
  
            <label className="flex min-h-[40px] items-center gap-2.5 text-[14px] text-ink-soft" title="Se poate copia în luna următoare">
              <input type="checkbox" className="h-[18px] w-[18px] shrink-0" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              <span>Se repetă lunar</span>
            </label>
            </>
          )}

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
      )}
    </Modal>
  );
}

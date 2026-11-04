"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { addMonths, lei, eur, monthLabel, parseAmount, type Currency, type Kind } from "@/lib/util";
import { activeTrip, type TripListItem } from "@/lib/trips";
import { api, Modal, Skeleton, Toast, useApi, useApp, useIsMobile } from "./ui";
import { TripExpenseForm } from "./Trips";
import { lastCardId, rememberCard, useCards } from "./Cards";

/**
 * Adăugarea rapidă, din butonul „+” al barei de jos (pe telefon): suma întâi, apoi categoria dintr-o atingere.
 * Aceeași fereastră editează și șterge o intrare existentă (atingi rândul din „Luna curentă”).
 * Intrarea se trece în luna analizată, cea din bara de sus. Cât timp ești în vacanță, fereastra are și
 * varianta „Vacanță”: cheltuiala merge la vacanța în curs, în moneda ei, nu în bugetul lunar.
 */

type Category = { id: number; name: string; kind: Kind; color: string; parent_id?: number | null };
type Goal = { id: number; name: string };
type Investment = { id: number; name: string };
export type QuickEntry = {
  id: number;
  kind: Kind;
  category_id: number | null;
  goal_id: number | null;
  investment_id: number | null;
  /** Cardul cu care s-a plătit (beta); lipsește pe intrările vechi. */
  card_id?: number | null;
  description: string;
  amount: number;
  currency: Currency;
  recurring: number;
  month?: string;
  created_at?: string | null;
  /** Contul pe care s-a făcut plata (beta). */
  account_id?: number | null;
  split_group?: string | null;
};

/** Ziua locală YYYY-MM-DD a unui moment. */
export function dayOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Data propusă pentru o intrare nouă în luna analizată: azi, dacă e luna curentă; altfel ultima sau prima zi a ei. */
function defaultDay(month: string) {
  const today = dayOf(new Date());
  if (today.startsWith(month)) return today;
  if (month < today.slice(0, 7)) {
    const [y, m] = month.split("-").map(Number);
    return dayOf(new Date(y, m, 0));
  }
  return `${month}-01`;
}

/** Data unei intrări existente; dacă ziua salvată nu e în luna intrării (trecută mai târziu), prima zi a lunii. */
export function entryDay(entry: QuickEntry) {
  const saved = entry.created_at ? dayOf(new Date(entry.created_at)) : null;
  if (saved && (!entry.month || saved.startsWith(entry.month))) return saved;
  return entry.month ? `${entry.month}-01` : dayOf(new Date());
}

/** Pune înapoi o intrare ștearsă (butonul „Anulează”): aceeași lună, dată și sumă, cu un id nou. */
export async function restoreEntry(e: QuickEntry) {
  await api("/api/crud/entries", "POST", {
    month: e.month,
    created_at: entryDay(e),
    kind: e.kind,
    category_id: e.category_id,
    goal_id: e.goal_id,
    investment_id: e.investment_id,
    ...(e.card_id ? { card_id: e.card_id } : {}),
    ...(e.account_id ? { account_id: e.account_id } : {}),
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

const LAST_ACCOUNT = "leuta:ultimul-cont";

/** Categoriile principale în ordine, fiecare urmată de subcategoriile ei. */
function orderByParent<T extends { id: number; parent_id?: number | null }>(list: T[]) {
  const ids = new Set(list.map((c) => c.id));
  const top = list.filter((c) => !c.parent_id || !ids.has(c.parent_id));
  return top.flatMap((p) => [p, ...list.filter((c) => c.parent_id === p.id)]);
}

function QuickAddSheet({ args, onClose, onDone }: { args: OpenArgs; onClose: () => void; onDone: (msg: string, undo?: () => void) => void }) {
  const { month, bump, confirm, eurRate, beta } = useApp();
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
  const [date, setDate] = useState(editing ? entryDay(editing) : defaultDay(month));
  const [dateTouched, setDateTouched] = useState(false);
  const targetMonth = date.slice(0, 7);
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

  // Cardul cu care plătești (beta, doar la cheltuieli). Fără alegere explicită: cardul intrării modificate sau,
  // la una nouă, ultimul card folosit pe acest dispozitiv (dacă mai există).
  const { data: cards } = useCards();
  const [cardPick, setCardPick] = useState<number | null | undefined>(undefined);
  const isExpense = kind === "variable" || kind === "fixed";
  const showCards = beta && isExpense && !!cards && cards.length > 0;
  const fallbackCard = editing ? editing.card_id ?? null : lastCardId();
  const cardId = cardPick !== undefined ? cardPick : cards?.some((c) => c.id === fallbackCard) ? fallbackCard : null;
  const pickedCard = isExpense && cardId ? cards?.find((c) => c.id === cardId) : undefined;

  // Conturile (beta): pe ce cont s-a făcut plata. Ultimul cont ales se propune data viitoare.
  const { data: accountsData } = useApi<{ accounts: { id: number; name: string; archived: number }[] }>(beta ? "/api/accounts" : null);
  const accounts = (accountsData?.accounts ?? []).filter((a) => !a.archived || a.id === editing?.account_id);
  const [accountId, setAccountId] = useState<number | null | undefined>(editing ? editing.account_id ?? null : undefined);
  useEffect(() => {
    if (accountId !== undefined || !accountsData) return;
    let last: number | null = null;
    try {
      last = Number(localStorage.getItem(LAST_ACCOUNT)) || null;
    } catch {}
    setAccountId(accountsData.accounts.some((a) => a.id === last && !a.archived) ? last : null);
  }, [accountsData, accountId]);
  // „Plătit cu” (beta): un singur rând cu cardurile (fiecare cu contul lui) și conturile fără card.
  // Cardul ales hotărăște contul; un card nelegat de un cont nu schimbă niciun sold.
  const effectiveAccount = pickedCard ? pickedCard.account_id ?? null : accountId;
  const cardAccounts = new Set((cards ?? []).map((c) => c.account_id).filter(Boolean));
  const payOptions: { key: string; name: string; sub?: string; color?: string | null; card: number | null; account: number | null }[] = [
    ...(isExpense && cards ? cards.map((c) => ({ key: `c:${c.id}`, name: c.name, sub: accounts.find((a) => a.id === c.account_id)?.name, color: c.color, card: c.id, account: c.account_id ?? null })) : []),
    ...accounts.filter((a) => !isExpense || !cardAccounts.has(a.id)).map((a) => ({ key: `a:${a.id}`, name: a.name, card: null, account: a.id })),
  ];
  const payKey = pickedCard ? `c:${pickedCard.id}` : accountId ? `a:${accountId}` : "";
  const pay = (o: { card: number | null; account: number | null }) => {
    setCardPick(o.card);
    setAccountId(o.account);
    stayMonthly();
  };

  // Etichetele (beta): text liber, refolosite după nume.
  const { data: allTags } = useApi<{ id: number; name: string }[]>(beta ? "/api/crud/tags" : null);
  const { data: entryTags } = useApi<{ id: number; name: string }[]>(beta && editing ? `/api/entries/tags?entry_id=${editing.id}` : null);
  const [tags, setTags] = useState<string[] | null>(editing ? null : []);
  const [tagInput, setTagInput] = useState("");
  useEffect(() => {
    if (tags === null && entryTags) setTags(entryTags.map((t) => t.name));
  }, [entryTags, tags]);
  const addTag = (raw: string) => {
    const name = raw.trim().replace(/^#+/, "");
    if (!name) return;
    setTags((prev) => ((prev ?? []).some((t) => t.toLowerCase() === name.toLowerCase()) ? prev : [...(prev ?? []), name]));
    setTagInput("");
  };
  const tagSuggestions = (allTags ?? [])
    .filter((t) => !(tags ?? []).some((x) => x.toLowerCase() === t.name.toLowerCase()) && t.name.toLowerCase().includes(tagInput.trim().toLowerCase()))
    .slice(0, 6);

  // Plata împărțită pe categorii (beta, doar la adăugarea unei cheltuieli).
  const [split, setSplit] = useState(false);
  const [parts, setParts] = useState<Record<number, string>>({});
  const togglePart = (id: number) =>
    setParts((prev) => (id in prev ? Object.fromEntries(Object.entries(prev).filter(([k]) => Number(k) !== id)) : { ...prev, [id]: "" }));

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

  // Subcategoriile (beta) stau imediat după categoria lor.
  const kindCats = orderByParent((cats ?? []).filter((c) => c.kind === kind));
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
  const canSplit = beta && !editing && (kind === "variable" || kind === "fixed");
  const splitOn = canSplit && split && !refund;
  const partSum = Object.values(parts).reduce((sum, v) => sum + (parseAmount(v) || 0), 0);
  const partLeft = Math.round((value - partSum) * 100) / 100;

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
    if (splitOn) return submitSplit();
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
      // Doar pe beta trimitem cardul; la venituri și economii nu are sens.
      ...(beta && cards ? { card_id: isExpense ? cardId : null } : {}),
      currency,
      recurring: recurring ? 1 : 0,
      // Contul se trimite doar când lista conturilor s-a încărcat, ca să nu ștergem din greșeală legătura existentă.
      ...(accountsData && effectiveAccount !== undefined ? { account_id: effectiveAccount } : {}),
    };
    if (accountsData && accountId && !pickedCard) {
      try {
        localStorage.setItem(LAST_ACCOUNT, String(accountId));
      } catch {}
    }
    setBusy(true);
    try {
      if (editing) {
        await api("/api/crud/entries", "PUT", { id: editing.id, ...payload });
        await saveTags([editing.id]);
        onDone("Modificare salvată");
        if (mobile) tick();
      } else {
        const row = await api<{ id: number }>("/api/crud/entries", "POST", payload);
        await saveTags([row.id]);
        if (showCards) rememberCard(cardId);
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

  /** Etichetele (beta) se salvează după intrare; dacă nu s-au încărcat încă (la modificare), nu se ating. */
  const saveTags = async (ids: number[]) => {
    if (!beta || tags === null) return;
    const pending = tagInput.trim() ? [...tags, tagInput.trim()] : tags;
    if (!editing && pending.length === 0) return;
    await api("/api/entries/tags", "PUT", { entry_ids: ids, tags: pending });
  };

  const submitSplit = async () => {
    const list = Object.entries(parts)
      .map(([id, v]) => ({ category_id: Number(id), amount: parseAmount(v) || 0 }))
      .filter((p) => p.amount > 0);
    if (list.length < 2) return setErr("Alege cel puțin două categorii și scrie suma fiecăreia.");
    if (Math.abs(partLeft) >= 0.005) return setErr(partLeft > 0 ? `Mai ai de împărțit ${lei(partLeft)}.` : `Părțile depășesc totalul cu ${lei(-partLeft)}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr("Alege data.");
    setBusy(true);
    try {
      const res = await api<{ entries: { id: number }[] }>("/api/entries/split", "POST", {
        month: targetMonth,
        created_at: date,
        kind,
        description: description.trim(),
        currency,
        amount: value,
        parts: list,
        ...(accountsData && effectiveAccount !== undefined ? { account_id: effectiveAccount } : {}),
        ...(beta && cards ? { card_id: cardId } : {}),
      });
      await saveTags(res.entries.map((e) => e.id));
      if (mobile) tick();
      onDone(`Plată împărțită pe ${list.length} categorii: ${currency === "EUR" ? eur(value) : lei(value)}`);
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
          await restoreEntry(editing);
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

          {payOptions.length > 0 && (
            <div>
              <span className="label">{kind === "income" ? "În contul" : kind === "saving" ? "Din contul" : "Plătit cu"}</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={kind === "income" ? "În contul" : "Plătit cu"}>
                {[{ key: "", name: "Nespecificat", card: null, account: null } as (typeof payOptions)[number], ...payOptions].map((o) => (
                  <button
                    key={o.key || "none"}
                    type="button"
                    role="radio"
                    aria-checked={payKey === o.key}
                    className={`${chip(payKey === o.key)} min-h-[36px]! py-1! text-[13px]!`}
                    onClick={() => pay(o)}
                  >
                    {o.color ? <span className="h-2 w-3.5 shrink-0 rounded-[2px]" style={{ background: o.color }} aria-hidden /> : null}
                    {o.name}
                    {o.sub ? <span className="text-[11.5px] opacity-60">· {o.sub}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                {shownCats.map((c) => {
                  const on = splitOn ? c.id in parts : categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={chip(on)}
                      aria-pressed={on}
                      disabled={busy}
                      onClick={() => {
                        stayMonthly();
                        setErr(null);
                        if (splitOn) return togglePart(c.id);
                        setCategoryId(c.id);
                        // Pe telefon, cu suma scrisă și detaliile strânse, atingerea categoriei salvează direct.
                        if (compact && !editing && value > 0) submit({ categoryId: c.id });
                      }}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: c.color }} aria-hidden />
                      {c.parent_id ? <span className="text-[12px] opacity-60" aria-hidden>↳</span> : null}
                      {c.name}
                    </button>
                  );
                })}
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
              <p className="-mt-2 text-[12px] text-ink-faint">Se trece în {monthLabel(targetMonth)}, luna datei alese.</p>
            )}
  
            <input
              className="field"
              placeholder="Descriere (opțional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Descriere"
            />

            {beta && tags !== null && (
              <div>
                <span className="label">Etichete (opțional)</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map((t) => (
                    <button key={t} type="button" className="rounded-full border border-albastru/40 bg-albastru-tint px-2.5 py-1 text-[13px] text-albastru" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Scoate eticheta ${t}`}>
                      #{t} ×
                    </button>
                  ))}
                  <input
                    className="field min-w-[8rem] flex-1 py-1.5!"
                    placeholder="ex. vacanță, cadou"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag(tagInput.replace(/,$/, ""));
                      }
                    }}
                    aria-label="Etichetă nouă"
                  />
                </div>
                {tagSuggestions.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {tagSuggestions.map((t) => (
                      <button key={t.id} type="button" className="rounded-full border border-line px-2 py-0.5 text-[12.5px] text-ink-soft" onClick={() => addTag(t.name)}>
                        + #{t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canSplit && !refund && (
              <div>
                <label className="flex min-h-[36px] items-center gap-2.5 text-[14px] text-ink-soft">
                  <input
                    type="checkbox"
                    className="h-[18px] w-[18px] shrink-0"
                    checked={split}
                    onChange={(e) => {
                      setSplit(e.target.checked);
                      setParts(e.target.checked && categoryId ? { [categoryId]: amount } : {});
                    }}
                  />
                  Împarte pe mai multe categorii (un singur bon)
                </label>
                {splitOn && (
                  <div className="mt-2 flex flex-col gap-2 rounded-md border border-line bg-paper p-3">
                    {Object.keys(parts).length === 0 && <p className="text-[13px] text-ink-faint">Atinge categoriile de mai sus și scrie suma fiecăreia.</p>}
                    {Object.entries(parts).map(([id, v]) => (
                      <label key={id} className="flex items-center gap-2 text-[14px]">
                        <span className="min-w-0 flex-1 truncate">{kindCats.find((c) => c.id === Number(id))?.name}</span>
                        <input
                          className="field num w-28"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={v}
                          onChange={(e) => setParts({ ...parts, [id]: e.target.value.replace(/[^\d.,]/g, "") })}
                          aria-label={`Suma pentru ${kindCats.find((c) => c.id === Number(id))?.name}`}
                        />
                      </label>
                    ))}
                    {Object.keys(parts).length > 0 && (
                      <p className={`text-right text-[12.5px] ${Math.abs(partLeft) < 0.005 ? "text-leu" : "text-ink-soft"}`}>
                        {Math.abs(partLeft) < 0.005 ? "Împărțit complet ✓" : partLeft > 0 ? `Mai ai de împărțit ${lei(partLeft)}` : `Peste total cu ${lei(-partLeft)}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
  
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

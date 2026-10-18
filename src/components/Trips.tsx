"use client";

import { useEffect, useRef, useState } from "react";
import { parseAmount } from "@/lib/util";
import { CURRENCIES, fmtCur, todayIso, TRIP_CATEGORIES, tripPhase, type Trip, type TripExpense, type TripFund } from "@/lib/trips";
import { api, Field } from "./ui";

/**
 * Formularele vacanțelor: vacanța, banii pe care îi ai deja și o cheltuială.
 * Sumele se trec în moneda în care plătești; nicio conversie la salvare.
 */

/** Suma din baza de date, gata de editat: „48” sau „48,50”. */
const amountText = (n: number | undefined) => (n === undefined ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));

const chip = (on: boolean) =>
  `flex min-h-[40px] items-center gap-2 rounded-md border px-3 py-1.5 text-left text-[14px] transition-colors active:scale-[0.98] ${
    on ? "border-ink bg-ink text-sheet" : "border-line-strong/70 bg-field text-ink"
  }`;

function Actions({ busy, label, onCancel, onDelete }: { busy: boolean; label: string; onCancel?: () => void; onDelete?: () => void }) {
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-dashed border-line-strong bg-sheet px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0">
      {onDelete && (
        <button type="button" className="btn-danger border border-rosu/30 px-4" onClick={onDelete}>
          Șterge
        </button>
      )}
      {onCancel && !onDelete && (
        <button type="button" className="btn-ghost border border-line-strong/70 px-4" onClick={onCancel}>
          Renunță
        </button>
      )}
      <button type="submit" className="btn-primary flex-1 py-3 text-[15px]" disabled={busy}>
        {busy ? "Se salvează…" : label}
      </button>
    </div>
  );
}

/** Lista monedelor uzuale, plus „Altă monedă” pentru orice cod din 3 litere. */
export function CurrencyPicker({ value, onChange, id }: { value: string; onChange: (c: string) => void; id?: string }) {
  const known = CURRENCIES.some((c) => c.code === value);
  const [other, setOther] = useState(!known);
  return (
    <div className="flex gap-2">
      <select
        id={id}
        className="field min-w-0 flex-1"
        value={other ? "" : value}
        onChange={(e) => {
          if (e.target.value === "") {
            setOther(true);
            onChange("");
          } else {
            setOther(false);
            onChange(e.target.value);
          }
        }}
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} · {c.name}
          </option>
        ))}
        <option value="">Altă monedă…</option>
      </select>
      {other && (
        <input
          className="field w-24 uppercase"
          maxLength={3}
          placeholder="Cod"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          aria-label="Codul monedei"
        />
      )}
    </div>
  );
}

// ---------- Vacanța ----------

export function TripForm({ trip, onSaved, onCancel }: { trip?: Trip; onSaved: (t: Trip) => void; onCancel: () => void }) {
  const [name, setName] = useState(trip?.name ?? "");
  const [destination, setDestination] = useState(trip?.destination ?? "");
  const [start, setStart] = useState(trip?.start_date ?? "");
  const [end, setEnd] = useState(trip?.end_date ?? "");
  const [currency, setCurrency] = useState(trip?.currency ?? "EUR");
  const [budget, setBudget] = useState(trip?.budget ? amountText(trip.budget) : "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const b = budget.trim() ? parseAmount(budget) : 0;
    if (!name.trim()) return setErr("Dă un nume vacanței.");
    if (!start || !end) return setErr("Alege perioada vacanței.");
    if (end < start) return setErr("Vacanța nu se poate termina înainte să înceapă.");
    if (!/^[A-Z]{3}$/.test(currency)) return setErr("Alege moneda locală.");
    if (Number.isNaN(b)) return setErr("Bugetul nu e o sumă validă.");
    const payload = { name: name.trim(), destination: destination.trim(), start_date: start, end_date: end, currency, budget: b };
    setBusy(true);
    try {
      onSaved(trip ? await api<Trip>("/api/crud/trips", "PUT", { id: trip.id, ...payload }) : await api<Trip>("/api/crud/trips", "POST", payload));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Nume">
        <input className="field" placeholder="ex. Vara în Grecia" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!trip} />
      </Field>
      <Field label="Destinație (opțional)">
        <input className="field" placeholder="ex. Thassos" value={destination} onChange={(e) => setDestination(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="De la">
          <input
            type="date"
            className="field"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (!end || end < e.target.value) setEnd(e.target.value);
            }}
          />
        </Field>
        <Field label="Până la">
          <input type="date" className="field" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Moneda locală" hint="Cheltuielile vor avea implicit această monedă.">
        <CurrencyPicker value={currency} onChange={setCurrency} />
      </Field>
      <Field
        label={`Buget estimat (în ${currency || "moneda vacanței"}, opțional)`}
        hint="Dacă treci banii pe care îi ai deja pentru vacanță, ei țin loc de buget."
      >
        <input className="field num" inputMode="decimal" placeholder="0,00" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.,\s]/g, ""))} />
      </Field>
      {err && <p className="text-[13px] text-rosu" role="alert">{err}</p>}
      <Actions busy={busy} label={trip ? "Salvează" : "Creează vacanța"} onCancel={onCancel} />
    </form>
  );
}

// ---------- Banii pe care îi ai deja ----------

export function FundForm({
  trip,
  fund,
  onSaved,
  onDelete,
}: {
  trip: Trip;
  fund?: TripFund;
  onSaved: (msg: string) => void;
  onDelete?: () => void;
}) {
  const [label, setLabel] = useState(fund?.label ?? "");
  const [amount, setAmount] = useState(amountText(fund?.amount));
  const [currency, setCurrency] = useState(fund?.currency ?? trip.currency);
  const [rate, setRate] = useState(fund?.rate_ron ? String(fund.rate_ron).replace(".", ",") : "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = parseAmount(amount);
    const r = rate.trim() && currency !== "RON" ? parseAmount(rate) : null;
    if (!(value > 0)) return setErr("Scrie o sumă mai mare decât 0.");
    if (!/^[A-Z]{3}$/.test(currency)) return setErr("Alege moneda.");
    if (r !== null && !(r > 0)) return setErr("Cursul nu e valid. Îl poți lăsa gol.");
    const payload = { trip_id: trip.id, label: label.trim(), amount: value, currency, rate_ron: r };
    setBusy(true);
    try {
      if (fund) await api("/api/crud/trip_funds", "PUT", { id: fund.id, ...payload });
      else await api("/api/crud/trip_funds", "POST", payload);
      onSaved(fund ? "Modificare salvată" : `${fmtCur(value, currency)} adăugați la banii vacanței`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-[13px] text-ink-soft">
        Banii schimbați dinainte sau puși deoparte pentru vacanță, direct în moneda lor. Cheltuielile în aceeași monedă scad din ei.
      </p>
      <Field label="Suma">
        <input
          className="field num !py-3 !text-[22px] font-semibold"
          inputMode="decimal"
          placeholder="0,00"
          autoFocus={!fund}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, ""))}
        />
      </Field>
      <Field label="Moneda">
        <CurrencyPicker value={currency} onChange={setCurrency} />
      </Field>
      <Field label="Unde sunt (opțional)">
        <input className="field" placeholder="ex. cash, card Revolut" value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      {currency !== "RON" && (
        <Field
          label={`Cursul la care i-ai cumpărat (lei pentru 1 ${currency || "unitate"}, opțional)`}
          hint="Doar pentru echivalentul în lei de la final. Gol = cursul BNR."
        >
          <input className="field num" inputMode="decimal" placeholder="ex. 5,02" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.,\s]/g, ""))} />
        </Field>
      )}
      {err && <p className="text-[13px] text-rosu" role="alert">{err}</p>}
      <Actions busy={busy} label={fund ? "Salvează" : "Adaugă banii"} onDelete={onDelete} />
    </form>
  );
}

// ---------- O cheltuială ----------

type TripRef = Pick<Trip, "id" | "name" | "currency" | "start_date" | "end_date">;

/** Data implicită: azi, dacă ești în vacanță; altfel prima zi a vacanței. */
const defaultDate = (t: TripRef) => (tripPhase(t) === "acum" ? todayIso() : t.start_date);

export function TripExpenseForm({
  trip,
  currencies = [],
  expense,
  onSaved,
  onDelete,
}: {
  trip: TripRef;
  /** Alte monede de propus (ex. ale banilor avuți), pe lângă moneda vacanței și lei. */
  currencies?: string[];
  expense?: TripExpense;
  onSaved: (msg: string) => void;
  onDelete?: () => void;
}) {
  const [amount, setAmount] = useState(amountText(expense?.amount));
  const [currency, setCurrency] = useState(expense?.currency ?? trip.currency);
  const [category, setCategory] = useState(expense?.category ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [date, setDate] = useState(expense?.date ?? defaultDate(trip));
  const [otherCurrency, setOtherCurrency] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const value = parseAmount(amount);
  const options = [...new Set([trip.currency, ...currencies, "RON", ...(expense ? [expense.currency] : [])])];

  useEffect(() => {
    if (!expense) amountRef.current?.focus();
  }, [expense]);

  const submit = async () => {
    if (!(value > 0)) {
      setErr("Scrie o sumă mai mare decât 0.");
      amountRef.current?.focus();
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) return setErr("Alege moneda.");
    if (!category) return setErr("Alege o categorie.");
    const payload = { trip_id: trip.id, date, category, description: description.trim(), amount: value, currency };
    setBusy(true);
    try {
      if (expense) await api("/api/crud/trip_expenses", "PUT", { id: expense.id, ...payload });
      else await api("/api/crud/trip_expenses", "POST", payload);
      onSaved(expense ? "Modificare salvată" : `${fmtCur(value, currency)} trecut la „${trip.name}”`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
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
          <span className="flex w-16 shrink-0 items-center justify-center rounded-md border border-ink bg-ink text-[14px] font-semibold text-sheet">
            {currency === "RON" ? "lei" : currency === "EUR" ? "€" : currency || "?"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Monedă">
          {options.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={!otherCurrency && currency === c}
              onClick={() => {
                setOtherCurrency(false);
                setCurrency(c);
              }}
              className={`min-h-[34px] rounded-md border px-3 text-[13px] font-semibold ${!otherCurrency && currency === c ? "border-ink bg-ink text-sheet" : "border-line-strong/70 bg-field text-ink-soft"}`}
            >
              {c === "RON" ? "lei" : c}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOtherCurrency(true)}
            className={`min-h-[34px] rounded-md border px-3 text-[13px] ${otherCurrency ? "border-ink text-ink" : "border-line-strong/70 bg-field text-ink-soft"}`}
          >
            Altă monedă
          </button>
        </div>
        {otherCurrency && (
          <div className="mt-2">
            <CurrencyPicker value={currency} onChange={setCurrency} />
          </div>
        )}
      </div>

      <div>
        <span className="label">Categoria</span>
        <div className="flex flex-wrap gap-1.5">
          {TRIP_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={chip(category === c.key)}
              aria-pressed={category === c.key}
              onClick={() => {
                setCategory(c.key);
                setErr(null);
              }}
            >
              <span aria-hidden>{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <input className="field" placeholder="Descriere (opțional)" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Descriere" />

      <Field label="Data">
        <input type="date" className="field" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>

      {err && <p className="text-[13px] text-rosu" role="alert">{err}</p>}
      <Actions busy={busy} label={expense ? "Salvează" : "Adaugă"} onDelete={onDelete} />
    </form>
  );
}

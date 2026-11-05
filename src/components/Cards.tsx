"use client";

import { useState } from "react";
import { api, Field, Panel, TrashIcon, useApi, useApp } from "./ui";

/**
 * Cardurile cu care plătești: o listă proprie, din Setări. La adăugarea unei cheltuieli alegi cardul
 * (fereastra de adăugare rapidă ține minte ultimul ales, pe dispozitivul curent).
 */

/** `account_id`: contul din care plătește cardul; cheltuielile cu cardul schimbă soldul lui. */
export type PayCard = { id: number; name: string; kind: "bank" | "meal"; color: string; account_id?: number | null };

type AccountOption = { id: number; name: string; archived: number };

export const CARD_KIND_LABEL: Record<PayCard["kind"], string> = { bank: "Card bancar", meal: "Tichete de masă" };

const CARD_COLORS = ["#2E5C8A", "#3D7A4E", "#B5456A", "#6A4E99", "#C99A1E", "#27496D", "#C9657F", "#8A989C"];

const LAST_CARD = "leuta.lastCard";

/** Ultimul card ales la o cheltuială (doar o comoditate pe acest dispozitiv). */
export function lastCardId(): number | null {
  try {
    const n = Number(localStorage.getItem(LAST_CARD));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function rememberCard(id: number | null) {
  try {
    if (id) localStorage.setItem(LAST_CARD, String(id));
    else localStorage.removeItem(LAST_CARD);
  } catch {}
}

/** Cardurile contului. */
export function useCards() {
  return useApi<PayCard[]>("/api/crud/cards");
}

function CardRow({ c, all, accounts, onChanged, onError }: { c: PayCard; all: PayCard[]; accounts: AccountOption[]; onChanged: (msg: string) => void; onError: (msg: string) => void }) {
  const { confirm } = useApp();
  const [d, setD] = useState(c);
  const dirty = d.name !== c.name || d.kind !== c.kind || d.color !== c.color || (d.account_id ?? null) !== (c.account_id ?? null);

  const save = async () => {
    const name = d.name.trim();
    if (!name) return onError("Numele cardului nu poate fi gol.");
    if (all.some((o) => o.id !== c.id && o.name.trim().toLowerCase() === name.toLowerCase())) return onError(`Ai deja un card „${name}”.`);
    try {
      await api("/api/crud/cards", "PUT", { id: c.id, name, kind: d.kind, color: d.color, ...(accounts.length ? { account_id: d.account_id ?? null } : {}) });
      onChanged("Card salvat");
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const remove = async () => {
    if (
      !(await confirm({
        title: "Ștergere card",
        message: `Sigur dorești să ștergi cardul „${c.name}”? Cheltuielile plătite cu el rămân, dar fără card.`,
        confirmText: "Șterge cardul",
        danger: true,
      }))
    )
      return;
    try {
      await api(`/api/crud/cards?id=${c.id}`, "DELETE");
      onChanged("Card șters");
    } catch (e) {
      onError((e as Error).message);
    }
  };

  return (
    <li className="flex items-center gap-1.5 py-1.5 sm:gap-2">
      <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="h-9 w-7 shrink-0 cursor-pointer rounded-sm border border-line bg-field p-0.5 sm:w-8" aria-label="Culoare" />
      <input className="field min-w-0 flex-1 py-1.5!" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} aria-label="Nume card" />
      <button
        type="button"
        className={`h-9 w-21 shrink-0 rounded-md border px-1 font-mono text-[11.5px] font-semibold uppercase tracking-[0.02em] transition-colors sm:w-24 ${
          d.kind === "meal" ? "border-leu/40 bg-leu-tint text-leu" : "border-albastru/40 bg-albastru-tint text-albastru"
        }`}
        onClick={() => setD({ ...d, kind: d.kind === "meal" ? "bank" : "meal" })}
        aria-label={`${CARD_KIND_LABEL[d.kind]}: atinge ca să schimbi`}
        title="Atinge ca să schimbi între card bancar și card de tichete"
      >
        {d.kind === "meal" ? "Tichete" : "Bancar"}
      </button>
      {accounts.length > 0 && (
        <select
          className="field w-24 shrink-0 px-1! py-1.5! text-[12.5px] sm:w-36"
          value={d.account_id ?? ""}
          onChange={(e) => setD({ ...d, account_id: e.target.value ? Number(e.target.value) : null })}
          aria-label={`Contul cardului ${c.name}`}
          title="Din ce cont plătește cardul"
        >
          <option value="">fără cont</option>
          {accounts.filter((a) => !a.archived || a.id === c.account_id).map((a) => (
            <option key={a.id} value={a.id}>din {a.name}</option>
          ))}
        </select>
      )}
      {dirty ? (
        <button className="btn-primary h-9 w-9 shrink-0 px-0 sm:w-auto sm:px-3" onClick={save} aria-label="Salvează" title="Salvează">
          <span className="sm:hidden" aria-hidden>✓</span>
          <span className="hidden sm:inline">Salvează</span>
        </button>
      ) : (
        <button className="btn-danger h-9 w-9 shrink-0 px-0" onClick={remove} aria-label={`Șterge cardul ${c.name}`} title="Șterge">
          <TrashIcon className="h-[17px] w-[17px]" />
        </button>
      )}
    </li>
  );
}

/** Panoul din Setări → General: cardurile tale (adaugă, redenumește, șterge). */
export function CardsPanel({ onToast }: { onToast: (msg: string) => void }) {
  const { bump } = useApp();
  const { data: cards, reload } = useCards();
  // Conturile: fiecare card bancar poate fi legat de contul din care plătește.
  const { data: accountsData } = useApi<{ accounts: AccountOption[] }>("/api/accounts");
  const accounts = accountsData?.accounts ?? [];
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PayCard["kind"]>("bank");

  const changed = (msg: string) => {
    reload();
    bump();
    onToast(msg);
  };

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (cards?.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())) return onToast(`Ai deja un card „${trimmed}”.`);
    try {
      await api("/api/crud/cards", "POST", { name: trimmed, kind, color: CARD_COLORS[(cards?.length ?? 0) % CARD_COLORS.length] });
      setName("");
      changed("Card adăugat");
    } catch (e) {
      onToast((e as Error).message);
    }
  };

  return (
    <Panel title="Carduri" summary={cards ? (cards.length ? `${cards.length} ${cards.length === 1 ? "card" : "carduri"}` : "Niciun card") : undefined}>
      <p className="mb-3 text-[13px] text-ink-soft">
        Cardurile cu care plătești. Când adaugi o cheltuială, alegi cardul folosit (de ex. cardul de tichete la alimente).
        {accounts.length > 0 && " Leagă cardul de contul lui ca cheltuielile cu el să scadă din soldul contului."}
      </p>
      {cards && cards.length > 0 && (
        <ul className="mb-3">
          {cards.map((c) => (
            <CardRow key={`${c.id}-${c.name}-${c.kind}-${c.color}-${c.account_id ?? 0}`} c={c} all={cards} accounts={accounts} onChanged={changed} onError={onToast} />
          ))}
        </ul>
      )}
      <form
        className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="col-span-2 min-w-[160px] flex-1">
          <Field label="Card nou">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Revolut, BT Visa, Edenred" maxLength={60} />
          </Field>
        </div>
        <select className="field sm:w-auto" value={kind} onChange={(e) => setKind(e.target.value as PayCard["kind"])} aria-label="Tipul cardului">
          <option value="bank">{CARD_KIND_LABEL.bank}</option>
          <option value="meal">{CARD_KIND_LABEL.meal}</option>
        </select>
        <button className="btn-primary" type="submit">
          Adaugă cardul
        </button>
      </form>
    </Panel>
  );
}

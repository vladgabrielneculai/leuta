"use client";

import Link from "next/link";
import { useState } from "react";
import type { Summary } from "@/lib/analytics";
import { addMonths, KIND_LABEL, lei, monthLabel, type Currency, type Kind } from "@/lib/util";
import { api, Money, PageHeader, Panel, Toast, useApi, useApp } from "@/components/ui";

type Category = { id: number; name: string; kind: Kind; bucket: string; color: string };
type Goal = { id: number; name: string; type: string };
type Investment = { id: number; name: string };
type Entry = {
  id: number;
  month: string;
  kind: Kind;
  category_id: number | null;
  goal_id: number | null;
  investment_id: number | null;
  description: string;
  amount: number;
  currency: Currency;
  recurring: number;
};

const KIND_INFO: Record<Kind, { color: string; help: string }> = {
  income: { color: "var(--c-leu)", help: "Salariu, bonusuri, chirii încasate, orice intră în cont." },
  fixed: { color: "var(--c-albastru)", help: "Plăți care se repetă cu aceeași sumă. Ratele creditelor se adaugă automat, nu le introduce aici." },
  variable: { color: "var(--c-rosu)", help: "Tot ce variază de la o lună la alta: mâncare, benzină, ieșiri, neprevăzute." },
  saving: { color: "var(--c-galben)", help: "Bani mutați spre un obiectiv, fondul de urgență sau o investiție. Plățile anticipate se înregistrează la credit." },
};

type Draft = {
  category_id: string;
  dest: string; // "", "g:ID", "i:ID"
  description: string;
  amount: string;
  currency: Currency;
  recurring: boolean;
};
const emptyDraft = (): Draft => ({ category_id: "", dest: "", description: "", amount: "", currency: "RON", recurring: false });

function destOf(e: Entry) {
  return e.goal_id ? `g:${e.goal_id}` : e.investment_id ? `i:${e.investment_id}` : "";
}

function EntryForm({
  kind, draft, setDraft, cats, goals, invs, onSubmit, submitLabel, onCancel,
}: {
  kind: Kind;
  draft: Draft;
  setDraft: (d: Draft) => void;
  cats: Category[];
  goals: Goal[];
  invs: Investment[];
  onSubmit: () => void;
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
    <form
      className="grid grid-cols-2 gap-2 sm:grid-cols-[1.3fr_1.5fr_1fr_80px_auto_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {kind === "saving" ? (
        <select className="field" value={draft.dest} onChange={(e) => setDraft({ ...draft, dest: e.target.value })} aria-label="Destinație">
          <option value="">Economii generale</option>
          {goals.length > 0 && (
            <optgroup label="Obiective">
              {goals.map((g) => <option key={g.id} value={`g:${g.id}`}>{g.name}</option>)}
            </optgroup>
          )}
          {invs.length > 0 && (
            <optgroup label="Investiții">
              {invs.map((i) => <option key={i.id} value={`i:${i.id}`}>{i.name}</option>)}
            </optgroup>
          )}
        </select>
      ) : (
        <select
          className="field"
          value={draft.category_id}
          onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}
          aria-label="Categorie"
          required
        >
          <option value="">Alege categoria</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <input
        className="field"
        placeholder="Descriere (opțional)"
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        aria-label="Descriere"
      />
      <input
        className="field num"
        type="number"
        step="0.01"
        min="0"
        placeholder="Sumă"
        value={draft.amount}
        onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
        aria-label="Sumă"
        required
      />
      <select
        className="field"
        value={draft.currency}
        onChange={(e) => setDraft({ ...draft, currency: e.target.value as Currency })}
        aria-label="Monedă"
      >
        <option>RON</option>
        <option>EUR</option>
      </select>
      <label className="flex items-center gap-1.5 text-[13px] text-ink-soft" title="Se copiază în luna următoare">
        <input type="checkbox" checked={draft.recurring} onChange={(e) => setDraft({ ...draft, recurring: e.target.checked })} />
        Lunar
      </label>
      <div className="flex gap-1">
        <button type="submit" className="btn-primary">{submitLabel}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Renunță</button>}
      </div>
    </form>
  );
}

function KindSection({
  kind, entries, cats, goals, invs, month, onChange, rate,
}: {
  kind: Kind;
  entries: Entry[];
  cats: Category[];
  goals: Goal[];
  invs: Investment[];
  month: string;
  onChange: (msg: string) => void;
  rate: number;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Draft>(emptyDraft());
  const [err, setErr] = useState<string | null>(null);
  const { confirm } = useApp();
  const info = KIND_INFO[kind];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const nameOfDest = (e: Entry) =>
    e.goal_id ? goals.find((g) => g.id === e.goal_id)?.name : e.investment_id ? invs.find((i) => i.id === e.investment_id)?.name : "Economii generale";
  const total = entries.reduce((s, e) => s + (e.currency === "EUR" ? e.amount * rate : e.amount), 0);

  const payload = (d: Draft) => ({
    month,
    kind,
    category_id: kind === "saving" ? cats[0]?.id ?? null : Number(d.category_id) || null,
    goal_id: d.dest.startsWith("g:") ? Number(d.dest.slice(2)) : null,
    investment_id: d.dest.startsWith("i:") ? Number(d.dest.slice(2)) : null,
    description: d.description.trim(),
    amount: Number(d.amount),
    currency: d.currency,
    recurring: d.recurring ? 1 : 0,
  });

  const add = async () => {
    try {
      await api("/api/crud/entries", "POST", payload(draft));
      setDraft({ ...emptyDraft(), currency: draft.currency });
      setErr(null);
      onChange("Intrare adăugată");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const save = async () => {
    try {
      await api("/api/crud/entries", "PUT", { id: editId, ...payload(edit) });
      setEditId(null);
      onChange("Modificare salvată");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const remove = async (e: Entry) => {
    const itemName = e.description || catMap.get(e.category_id ?? 0)?.name || "această intrare";
    if (
      !(await confirm({
        title: "Ștergere intrare",
        message: `Sigur dorești să ștergi „${itemName}” (${lei(e.amount)}) din luna ${monthLabel(month)}?`,
        confirmText: "Șterge",
        danger: true,
      }))
    )
      return;
    await api(`/api/crud/entries?id=${e.id}`, "DELETE");
    onChange("Intrare ștearsă");
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-1.5 rounded-sm" style={{ background: info.color }} />
          {KIND_LABEL[kind]}
        </span>
      }
      aside={<span className="num font-medium">{lei(total)}</span>}
    >
      <p className="mb-4 text-[13px] text-ink-soft">{info.help}</p>
      {entries.length > 0 && (
        <ul className="mb-4 divide-y divide-line border-y border-line">
          {entries.map((e) =>
            editId === e.id ? (
              <li key={e.id} className="py-2.5">
                <EntryForm kind={kind} draft={edit} setDraft={setEdit} cats={cats} goals={goals} invs={invs}
                  onSubmit={save} submitLabel="Salvează" onCancel={() => setEditId(null)} />
              </li>
            ) : (
              <li key={e.id} className="group flex items-center gap-3 py-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: kind === "saving" ? info.color : catMap.get(e.category_id ?? 0)?.color ?? "var(--c-ink-faint)" }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {kind === "saving" ? nameOfDest(e) : catMap.get(e.category_id ?? 0)?.name ?? "Fără categorie"}
                    {e.recurring ? <span className="ml-2 rounded bg-albastru-tint px-1.5 text-[11px] text-albastru">lunar</span> : null}
                  </div>
                  {e.description && <div className="truncate text-[13px] text-ink-soft">{e.description}</div>}
                </div>
                <span className="num text-right">
                  {e.currency === "EUR" ? `${e.amount.toLocaleString("ro-RO")} €` : lei(e.amount, e.amount % 1 !== 0)}
                  {e.currency === "EUR" && <span className="block text-[12px] text-ink-faint">{lei(e.amount * rate)}</span>}
                </span>
                <div className="flex opacity-60 group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    className="btn-ghost px-2"
                    onClick={() => {
                      setEditId(e.id);
                      setEdit({
                        category_id: String(e.category_id ?? ""),
                        dest: destOf(e),
                        description: e.description,
                        amount: String(e.amount),
                        currency: e.currency,
                        recurring: !!e.recurring,
                      });
                    }}
                  >
                    Editează
                  </button>
                  <button className="btn-danger px-2" onClick={() => remove(e)}>Șterge</button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      <EntryForm kind={kind} draft={draft} setDraft={setDraft} cats={cats} goals={goals} invs={invs} onSubmit={add} submitLabel="Adaugă" />
      {err && <p className="mt-2 text-[13px] text-rosu">{err}</p>}
    </Panel>
  );
}

export default function MonthPage() {
  const { month, bump, eurRate } = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const { data: entries, reload } = useApi<Entry[]>(`/api/crud/entries?month=${month}`);
  const { data: cats } = useApi<Category[]>("/api/crud/categories");
  const { data: goals } = useApi<Goal[]>("/api/crud/goals");
  const { data: invs } = useApi<Investment[]>("/api/crud/investments");
  const { data: s, reload: reloadSummary } = useApi<Summary>(`/api/summary?month=${month}`);

  const { data: settings } = useApi<Record<string, string>>("/api/settings");
  const investmentsEnabled = settings?.enable_investments === "1";

  const rate = s?.fx.rate ?? eurRate;
  const changed = (msg: string) => {
    reload();
    reloadSummary();
    setToast(msg);
  };

  const copyPrev = async () => {
    const r = await api<{ copied: number; skipped: number }>("/api/copy-month", "POST", { from: addMonths(month, -1), to: month });
    changed(
      r.copied
        ? `Am copiat ${r.copied} ${r.copied === 1 ? "intrare recurentă" : "intrări recurente"}`
        : r.skipped
          ? "Intrările recurente există deja în această lună"
          : "Luna trecută nu are intrări marcate ca lunare",
    );
    bump();
  };

  const kinds: Kind[] = ["income", "fixed", "variable", "saving"];
  const t = s?.totals;

  // Calcul tichete de masa si alimente
  const mealTicketCat = cats?.find((c) => c.name.toLowerCase().includes("tichet"));
  const foodCat = cats?.find((c) => c.name.toLowerCase().includes("aliment"));

  const mealTicketTotal =
    entries
      ?.filter(
        (e) =>
          e.kind === "income" &&
          (e.category_id === mealTicketCat?.id || e.description.toLowerCase().includes("tichet")),
      )
      .reduce((sum, e) => sum + (e.currency === "EUR" ? e.amount * rate : e.amount), 0) ?? 0;

  const foodTotal =
    entries
      ?.filter(
        (e) =>
          e.kind === "variable" &&
          (e.category_id === foodCat?.id || e.description.toLowerCase().includes("aliment")),
      )
      .reduce((sum, e) => sum + (e.currency === "EUR" ? e.amount * rate : e.amount), 0) ?? 0;

  const outOfPocketFood = Math.max(0, foodTotal - mealTicketTotal);

  return (
    <>
      <PageHeader
        title={`Luna ${monthLabel(month)}`}
        intro="Introdu ce a intrat și ce a ieșit. Utilitățile (apă, curent, gaze, întreținere) sunt variabile și se trec conform facturilor."
        actions={<button className="btn-primary" onClick={copyPrev}>Copiază intrările lunare din {monthLabel(addMonths(month, -1))}</button>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          {!entries || !cats || !goals || !invs ? (
            <p className="text-ink-soft">Se încarcă…</p>
          ) : (
            kinds.map((k) => (
              <KindSection
                key={k}
                kind={k}
                month={month}
                rate={rate}
                entries={entries.filter((e) => e.kind === k)}
                cats={k === "saving" ? cats.filter((c) => c.kind === "saving") : cats.filter((c) => c.kind === k)}
                goals={goals}
                invs={investmentsEnabled ? invs : []}
                onChange={changed}
              />
            ))
          )}
        </div>

        <aside className="xl:sticky xl:top-8 xl:self-start flex flex-col gap-5">
          <Panel title="Bilanțul lunii">
            {t ? (
              <div className="flex flex-col gap-4">
                <Row label="Venituri" value={t.income} color="var(--c-leu)" rate={rate} />
                <Row label="Costuri fixe" value={t.fixed} color="var(--c-albastru)" rate={rate} />
                <div>
                  <Row label="Rate credite" value={t.loanPayments + t.loanInsurance} color="var(--c-mov)" rate={rate} />
                  {s!.loans.length > 0 && (
                    <Link href="/credite" className="ml-4 text-[12px] text-albastru hover:underline">calculate automat</Link>
                  )}
                </div>
                <Row label="Cheltuieli variabile" value={t.variable} color="var(--c-rosu)" rate={rate} />
                <Row label={investmentsEnabled ? "Economii și investiții" : "Economii"} value={t.savings + (investmentsEnabled ? t.investments : 0)} color="var(--c-galben)" rate={rate} />
                {t.prepayments > 0 && <Row label="Plăți anticipate" value={t.prepayments} color="var(--c-galben)" rate={rate} />}
                {t.prepayFees > 0 && <Row label="Comisioane rambursare" value={t.prepayFees} color="var(--c-mov)" rate={rate} />}
                <div className="border-t border-line pt-3">
                  <div className="text-[13px] text-ink-soft">{t.unallocated >= 0 ? "Rămas nealocat" : "Depășire"}</div>
                  <Money value={t.unallocated} rate={rate} size="lg" tone={t.unallocated < 0 ? "rosu" : "leu"} />
                </div>
              </div>
            ) : (
              <p className="text-ink-soft">Se calculează…</p>
            )}
          </Panel>

          {/* Widget Card Tichete de Masă & Buget Alimente */}
          <Panel title="Card Tichete de Masă & Alimente">
            <div className="flex flex-col gap-2.5 text-[13px]">
              <div className="flex justify-between items-center">
                <span className="text-ink-soft">Tichete încărcate luna asta:</span>
                <span className="num font-semibold text-leu">{lei(mealTicketTotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-soft">Cheltuieli totale alimente:</span>
                <span className="num font-semibold text-ink">{lei(foodTotal)}</span>
              </div>
              <div className="border-t border-line pt-2 flex justify-between items-center">
                <span className="text-ink-soft">Din salariu / bani proprii:</span>
                <span className="num font-semibold text-mov">{lei(outOfPocketFood)}</span>
              </div>
              {foodTotal > 0 ? (
                <div className="mt-1 rounded bg-paper p-2 text-[12px] text-ink-soft border border-line">
                  {mealTicketTotal >= foodTotal ? (
                    <span className="text-leu font-medium">✓ Tichetele acoperă 100% din cheltuielile cu alimentele!</span>
                  ) : (
                    <span>Tichetele acoperă <strong>{Math.round((mealTicketTotal / foodTotal) * 100)}%</strong> din mâncare.</span>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-ink-soft mt-1">
                  Introdu cheltuielile cu alimentele și tichetele lunare pentru calculul automat.
                </p>
              )}
            </div>
          </Panel>

          <Toast message={toast} onDone={() => setToast(null)} />
        </aside>
      </div>
    </>
  );
}

function Row({ label, value, color, rate }: { label: string; value: number; color: string; rate: number }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-2 text-[14px]">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        {label}
      </span>
      <Money value={value} rate={rate} size="sm" />
    </div>
  );
}

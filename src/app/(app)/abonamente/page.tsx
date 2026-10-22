"use client";

import { useState } from "react";
import type { Detected } from "@/lib/scheduled";
import type { Alert, RecurringCandidate, ScheduleView } from "@/lib/scheduledServer";
import { KIND_LABEL, lei, monthLabel, type Kind } from "@/lib/util";
import { api, CollapsiblePanels, Empty, Field, Modal, PageHeader, Panel, PencilIcon, Stat, STAT_STRIP, Toast, TrashIcon, useApi, useApp } from "@/components/ui";

type Overview = { today: string; schedules: ScheduleView[]; detected: Detected[]; alerts: Alert[]; recurring: RecurringCandidate[] };
type Category = { id: number; name: string; kind: Kind };

const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
const fmtDate = (d: string) => d.split("-").reverse().join(".");
const money = (n: number, currency: string) => (currency === "EUR" ? `${n.toFixed(2).replace(".", ",")} €` : lei(n));

function when(s: { frequency: string; day: number; month_of_year: number | null }) {
  const day = s.day === 31 ? "ultima zi" : `pe ${s.day}`;
  return s.frequency === "yearly" ? `anual, ${s.day} ${MONTHS[(s.month_of_year ?? 1) - 1]}` : `lunar, ${day}`;
}

function relDays(days: number) {
  return days <= 0 ? "azi" : days === 1 ? "mâine" : `peste ${days} zile`;
}

type Draft = {
  id?: number; name: string; category_id: string; amount: string; currency: "RON" | "EUR"; frequency: "monthly" | "yearly";
  day: string; month_of_year: string; start_month: string; end_month: string; is_subscription: boolean;
};

const emptyDraft = (month: string): Draft => ({
  name: "", category_id: "", amount: "", currency: "RON", frequency: "monthly", day: "1", month_of_year: String(Number(month.slice(5, 7))),
  start_month: month, end_month: "", is_subscription: true,
});

/**
 * Abonamente și tranzacții programate (beta): plățile care se repetă intră singure în buget în ziua scadenței,
 * iar abonamentele se găsesc automat în intrările existente.
 */
export default function AbonamentePage() {
  const { confirm, bump } = useApp();
  const ov = useApi<Overview>("/api/scheduled");
  const cats = useApi<Category[]>("/api/crud/categories");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convert, setConvert] = useState<Record<number, { on: boolean; day: string; sub: boolean }>>({});

  if (ov.error && /nu există/i.test(ov.error)) {
    return <Empty title="Pagina nu există">Abonamentele și programările sunt disponibile doar în versiunea beta.</Empty>;
  }
  const data = ov.data;
  const thisMonth = (data?.today ?? new Date().toISOString()).slice(0, 7);

  const reload = () => {
    ov.reload();
    bump(); // panoul și luna se recalculează cu intrările noi
  };

  const announce = (created: number, base: string) =>
    setToast(created > 0 ? `${base} Am adăugat ${created} ${created === 1 ? "intrare scadentă" : "intrări scadente"} în buget.` : base);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...draft,
        category_id: Number(draft.category_id),
        amount: Number(draft.amount.replace(",", ".")),
        day: Number(draft.day),
        month_of_year: Number(draft.month_of_year),
        end_month: draft.end_month || null,
      };
      const res = await api<{ created: number }>("/api/scheduled", draft.id ? "PUT" : "POST", body);
      setDraft(null);
      announce(res.created, draft.id ? "Programarea a fost modificată." : "Programarea a fost adăugată.");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Programarea nu a putut fi salvată.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (s: ScheduleView) => {
    const res = await api<{ created: number }>("/api/scheduled", "PUT", { id: s.id, active: !s.active });
    announce(res.created, s.active ? `„${s.name}” e oprită.` : `„${s.name}” e pornită din nou.`);
    reload();
  };

  const remove = async (s: ScheduleView) => {
    const ok = await confirm({
      title: "Ștergi programarea?",
      message: `„${s.name}” nu mai adaugă intrări noi. Intrările deja create rămân în buget.`,
      confirmText: "Șterge",
      danger: true,
    });
    if (!ok) return;
    await api(`/api/scheduled?id=${s.id}`, "DELETE");
    setToast("Programarea a fost ștearsă.");
    reload();
  };

  const schedule = async (d: Detected) => {
    if (!d.category_id) {
      setDraft({ ...emptyDraft(d.next.slice(0, 7)), name: d.name, amount: String(d.amount), day: String(d.day), frequency: d.frequency, month_of_year: String(d.month_of_year ?? 1) });
      return;
    }
    // Luna ultimei plăți are deja intrarea, deci programarea începe cu următoarea scadență.
    const res = await api<{ created: number }>("/api/scheduled", "POST", {
      name: d.name, category_id: d.category_id, amount: d.amount, currency: d.currency, frequency: d.frequency,
      day: d.day, month_of_year: d.month_of_year, start_month: d.next.slice(0, 7), is_subscription: true,
    });
    announce(res.created, `„${d.name}” e programat; următoarea plată pe ${fmtDate(d.next)}.`);
    reload();
  };

  const ignore = async (d: Detected) => {
    await api("/api/scheduled/ignore", "POST", { key: d.key });
    setToast(`„${d.name}” nu mai apare la abonamente detectate.`);
    reload();
  };

  const runConvert = async () => {
    const items = Object.entries(convert)
      .filter(([, v]) => v.on)
      .map(([id, v]) => ({ entryId: Number(id), day: Number(v.day) || 1, subscription: v.sub }));
    if (!items.length) return;
    setBusy(true);
    try {
      const res = await api<{ converted: number; created: number }>("/api/scheduled/convert", "POST", { items });
      setConvert({});
      announce(res.created, `Am transformat ${res.converted} ${res.converted === 1 ? "intrare" : "intrări"} în programări.`);
      reload();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Intrările nu au putut fi transformate.");
    } finally {
      setBusy(false);
    }
  };

  const active = data?.schedules.filter((s) => s.active) ?? [];
  const subs = active.filter((s) => s.is_subscription && s.currency === "RON");
  const monthlySubs = subs.reduce((t, s) => t + s.monthly, 0);
  const detectedMonthly = (data?.detected ?? []).filter((d) => d.currency === "RON").reduce((t, d) => t + (d.frequency === "yearly" ? d.amount / 12 : d.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Abonamente și programări"
        intro="Plățile care se repetă intră singure în buget în ziua scadenței. Abonamentele le găsesc și în intrările tale."
        actions={<button className="btn-primary" onClick={() => { setError(null); setDraft(emptyDraft(thisMonth)); }}>+ Programare nouă</button>}
      />

      <section className={`panel ${STAT_STRIP}`}>
        <Stat label="Abonamente / lună" accent="var(--c-mov)" hint="programate, în lei">
          <span className="font-display text-[22px] font-bold tabular-nums">{lei(monthlySubs)}</span>
        </Stat>
        <Stat label="Abonamente / an" accent="var(--c-albastru)">
          <span className="font-display text-[22px] font-bold tabular-nums">{lei(monthlySubs * 12)}</span>
        </Stat>
        <Stat label="Detectate, neprogramate" accent="var(--c-galben)" hint="pe lună">
          <span className="font-display text-[22px] font-bold tabular-nums">{lei(detectedMonthly)}</span>
        </Stat>
      </section>

      {!!data?.alerts.length && (
        <Panel title="De știut">
          <ul className="flex flex-col gap-2 text-[13.5px]">
            {data.alerts.map((a, i) => (
              <li key={i} className={`rounded-md p-3 ${a.type === "price" ? "bg-rosu-tint text-rosu" : "bg-galben/15 text-ink"}`}>
                {a.type === "renewal" ? (
                  <>🔁 <strong>{a.name}</strong> se reînnoiește {relDays(a.days)} ({fmtDate(a.date)}): {money(a.amount, a.currency)}.</>
                ) : (
                  <>📈 <strong>{a.name}</strong> s-a scumpit: de la {money(a.previous, a.currency)} la {money(a.amount, a.currency)} (+{money(a.amount - a.previous, a.currency)} pe plată).</>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Programări" summary={data ? `${active.length} active` : undefined} pad={false}>
        {!data ? (
          <p className="p-5 text-[13px] text-ink-soft">Se încarcă…</p>
        ) : !data.schedules.length ? (
          <div className="p-4 sm:p-5">
            <Empty title="Nicio programare încă">
              Adaugă o plată care se repetă (chirie, abonament, rată la sală) sau programează un abonament detectat mai jos.
            </Empty>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data.schedules.map((s) => (
              <li key={s.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5 ${s.active ? "" : "opacity-55"}`}>
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                    {s.name}
                    {!!s.is_subscription && <span className="rounded-full bg-mov/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mov">abonament</span>}
                    {!s.active && <span className="text-[11px] font-normal text-ink-faint">oprită</span>}
                  </div>
                  <div className="text-[12px] text-ink-soft">
                    {s.category ?? <span className="text-rosu">categorie ștearsă</span>} · {when(s)}
                    {s.next && <> · următoarea: {fmtDate(s.next)}</>}
                    {s.end_month && <> · până în {monthLabel(s.end_month)}</>}
                  </div>
                </div>
                <div className={`mr-auto text-[14px] font-semibold tabular-nums sm:mr-0 ${s.kind === "income" ? "text-leu" : "text-ink"}`}>
                  {money(s.amount, s.currency)}
                </div>
                <div className="flex items-center gap-1">
                  <button className="btn-ghost px-2 py-1 text-[12px]" onClick={() => toggle(s)}>{s.active ? "Oprește" : "Pornește"}</button>
                  <button
                    className="btn-ghost h-8 w-8 px-0"
                    aria-label={`Modifică ${s.name}`}
                    onClick={() => {
                      setError(null);
                      setDraft({
                        id: s.id, name: s.name, category_id: s.category_id ? String(s.category_id) : "", amount: String(s.amount),
                        currency: s.currency === "EUR" ? "EUR" : "RON", frequency: s.frequency, day: String(s.day),
                        month_of_year: String(s.month_of_year ?? 1), start_month: s.start_month, end_month: s.end_month ?? "",
                        is_subscription: !!s.is_subscription,
                      });
                    }}
                  >
                    <PencilIcon />
                  </button>
                  <button className="btn-ghost h-8 w-8 px-0 text-rosu" aria-label={`Șterge ${s.name}`} onClick={() => remove(s)}>
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Pe telefon, listele secundare se deschid la atingere; programările rămân la vedere. */}
      <CollapsiblePanels>
      <div className="flex flex-col gap-6">
      <Panel title="Abonamente detectate" summary={data ? `${data.detected.length} găsite` : undefined} pad={false}>
        {!data?.detected.length ? (
          <p className="p-4 text-[13px] text-ink-soft sm:p-5">
            N-am găsit plăți care să se repete. Le caut în intrările din ultimele 15 luni: aceeași plată, lună de lună sau an de an,
            cu sumă apropiată. Cu cât imporți mai multe extrase, cu atât le găsesc mai sigur.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {data.detected.map((d) => (
              <li key={d.key} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:px-5">
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <div className="text-[14px] font-semibold text-ink">{d.name}</div>
                  <div className="text-[12px] text-ink-soft">
                    {d.category ?? "fără categorie"} · {when(d)} · {d.months.length} plăți · următoarea estimată: {fmtDate(d.next)}
                  </div>
                </div>
                <div className="mr-auto sm:mr-0 sm:text-right">
                  <div className="text-[14px] font-semibold tabular-nums">{money(d.amount, d.currency)}</div>
                  {d.previous !== null && <div className="text-[11.5px] text-ink-faint">înainte: {money(d.previous, d.currency)}</div>}
                </div>
                <div className="flex gap-1">
                  <button className="btn-ghost px-2 py-1 text-[12px]" onClick={() => ignore(d)}>Ignoră</button>
                  <button className="btn-primary px-3 py-1 text-[12px]" onClick={() => schedule(d)}>Programează</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {!!data?.recurring.length && (
        <Panel title="Intrări recurente" summary={`${data.recurring.length} din ${monthLabel(data.recurring[0].month)}`}>
          <p className="mb-3 text-[13px] text-ink-soft">
            Acum le copiezi manual în fiecare lună. Transformate în programări, apar singure în ziua aleasă, începând cu luna
            de după {monthLabel(data.recurring[0].month)}. Cele legate de un obiectiv sau de o investiție rămân ca acum.
          </p>
          <ul className="divide-y divide-line">
            {data.recurring.map((r) => {
              const c = convert[r.id] ?? { on: false, day: "1", sub: false };
              const set = (p: Partial<typeof c>) => setConvert((x) => ({ ...x, [r.id]: { ...c, ...p } }));
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-[13px]">
                  <label className="flex min-w-0 basis-full items-center gap-2 sm:basis-0 sm:flex-1">
                    <input type="checkbox" className="h-4 w-4" checked={c.on} onChange={(e) => set({ on: e.target.checked })} />
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-ink">{r.description || r.category}</span>{" "}
                      <span className="text-ink-faint">· {r.category} · {KIND_LABEL[r.kind as Kind] ?? r.kind}</span>
                    </span>
                  </label>
                  <span className="ml-6 mr-auto tabular-nums sm:ml-0 sm:mr-0">{money(r.amount, r.currency)}</span>
                  <label className="flex items-center gap-1 text-[12px] text-ink-soft">
                    pe
                    <input className="field w-14 py-1 text-center" inputMode="numeric" value={c.day} disabled={!c.on} onChange={(e) => set({ day: e.target.value.replace(/\D/g, "").slice(0, 2) })} aria-label="Ziua" />
                  </label>
                  <label className="flex items-center gap-1 text-[12px] text-ink-soft">
                    <input type="checkbox" checked={c.sub} disabled={!c.on} onChange={(e) => set({ sub: e.target.checked })} /> abonament
                  </label>
                </li>
              );
            })}
          </ul>
          <button className="btn-primary mt-3" disabled={busy || !Object.values(convert).some((v) => v.on)} onClick={runConvert}>
            Transformă în programări
          </button>
        </Panel>
      )}
      </div>
      </CollapsiblePanels>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Modifică programarea" : "Programare nouă"}>
        {draft && (
          <ScheduleForm draft={draft} setDraft={setDraft} cats={cats.data ?? []} error={error} busy={busy} onSave={save} />
        )}
      </Modal>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function ScheduleForm({
  draft, setDraft, cats, error, busy, onSave,
}: {
  draft: Draft; setDraft: (d: Draft) => void; cats: Category[]; error: string | null; busy: boolean; onSave: () => void;
}) {
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const kinds = [...new Set(cats.map((c) => c.kind))];
  const ready = draft.name.trim() && draft.category_id && Number(draft.amount.replace(",", ".")) > 0 && Number(draft.day) >= 1;
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (ready) onSave(); }}>
      <Field label="Nume">
        <input className="field" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex. Netflix, chirie, sală" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sumă">
          <input className="field" inputMode="decimal" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0,00" />
        </Field>
        <Field label="Monedă">
          <select className="field" value={draft.currency} onChange={(e) => set({ currency: e.target.value as "RON" | "EUR" })}>
            <option value="RON">RON</option>
            <option value="EUR">EUR</option>
          </select>
        </Field>
      </div>
      <Field label="Categorie">
        <select className="field" value={draft.category_id} onChange={(e) => set({ category_id: e.target.value })}>
          <option value="">Alege categoria…</option>
          {kinds.map((k) => (
            <optgroup key={k} label={KIND_LABEL[k]}>
              {cats.filter((c) => c.kind === k).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cât de des">
          <select className="field" value={draft.frequency} onChange={(e) => set({ frequency: e.target.value as Draft["frequency"] })}>
            <option value="monthly">Lunar</option>
            <option value="yearly">Anual</option>
          </select>
        </Field>
        <Field label="Ziua" hint="31 = ultima zi a lunii">
          <input className="field" inputMode="numeric" value={draft.day} onChange={(e) => set({ day: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
        </Field>
      </div>
      {draft.frequency === "yearly" && (
        <Field label="Luna plății">
          <select className="field" value={draft.month_of_year} onChange={(e) => set({ month_of_year: e.target.value })}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Începând cu" hint="Dacă scadența a trecut deja, intrarea se adaugă acum.">
          <input className="field" type="month" value={draft.start_month} onChange={(e) => set({ start_month: e.target.value })} />
        </Field>
        <Field label="Până în (opțional)">
          <input className="field" type="month" value={draft.end_month} onChange={(e) => set({ end_month: e.target.value })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={draft.is_subscription} onChange={(e) => set({ is_subscription: e.target.checked })} />
        E un abonament (intră la costul abonamentelor și primești alertă înainte de reînnoire)
      </label>
      {draft.id && <p className="text-[12px] text-ink-faint">Modificarea se aplică de la următoarea scadență; intrările deja create rămân cum sunt.</p>}
      {error && <div className="rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">{error}</div>}
      <button className="btn-primary" type="submit" disabled={!ready || busy}>{busy ? "Se salvează…" : "Salvează"}</button>
    </form>
  );
}

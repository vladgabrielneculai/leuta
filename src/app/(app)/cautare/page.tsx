"use client";

import { useEffect, useMemo, useState } from "react";
import type { FoundEntry, SearchTotals } from "@/lib/entrySearch";
import { addMonths, eur, KIND_LABEL, lei, monthLabel, type Kind } from "@/lib/util";
import { useQuickAdd } from "@/components/QuickAdd";
import { Empty, Field, Money, PageHeader, Panel, Skeleton, Stat, STAT_STRIP, useApi, useApp } from "@/components/ui";

type Category = { id: number; name: string; kind: Kind; color: string };
type Result = { rows: FoundEntry[]; truncated: boolean; totals: SearchTotals };

type Filters = { q: string; kind: "" | Kind; category_id: string; from: string; to: string; min: string; max: string; refunds: boolean };

const EMPTY: Filters = { q: "", kind: "", category_id: "", from: "", to: "", min: "", max: "", refunds: false };

function query(f: Filters) {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.kind) p.set("kind", f.kind);
  if (f.category_id) p.set("category_id", f.category_id);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.min.trim()) p.set("min", f.min.trim());
  if (f.max.trim()) p.set("max", f.max.trim());
  if (f.refunds) p.set("refunds", "1");
  return p.toString();
}

const fmtDay = (d: string) => d.split("-").reverse().join(".");

/**
 * Căutare în toate intrările, din toate lunile (beta): după text, tip, categorie, perioadă și sumă.
 * Rezultatele se pot descărca în CSV (se deschide direct în Excel) și se pot modifica dintr-o atingere.
 */
export default function SearchPage() {
  const quickAdd = useQuickAdd();
  const [f, setF] = useState<Filters>(EMPTY);
  // Textul se caută după o scurtă pauză în tastare, nu la fiecare literă.
  const { nowMonth } = useApp();
  const [qs, setQs] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQs(query(f)), 300);
    return () => clearTimeout(t);
  }, [f]);

  const { data: cats } = useApi<Category[]>("/api/crud/categories");
  const { data, error, loading } = useApi<Result>(`/api/entries/search?${qs}`, [qs]);
  const catMap = useMemo(() => new Map((cats ?? []).map((c) => [c.id, c])), [cats]);
  const kindCats = (cats ?? []).filter((c) => !f.kind || c.kind === f.kind);

  if (error && /nu există/i.test(error)) {
    return <Empty title="Pagina nu există">Căutarea în toate intrările este disponibilă doar în versiunea beta.</Empty>;
  }

  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));
  const now = nowMonth;
  const presets: { label: string; from: string; to: string }[] = [
    { label: "Luna aceasta", from: now, to: now },
    { label: "Ultimele 3 luni", from: addMonths(now, -2), to: now },
    { label: "Anul acesta", from: `${now.slice(0, 4)}-01`, to: now },
    { label: "Ultimele 12 luni", from: addMonths(now, -11), to: now },
  ];
  const filtered = qs !== "";
  const t = data?.totals;
  const spent = t ? t.fixed + t.variable : 0;

  return (
    <>
      <PageHeader
        title="Caută"
        intro="Găsește orice intrare, din orice lună: după text, categorie, perioadă sau sumă. Rezultatele se pot descărca pentru Excel."
        actions={
          <a className="btn-ghost" href={`/api/entries/search?${qs}${qs ? "&" : ""}format=csv`} download>
            Descarcă CSV
          </a>
        }
      />

      <Panel title="Filtre" aside={filtered ? <button className="btn-ghost px-2 text-[13px]" onClick={() => setF(EMPTY)}>Șterge filtrele</button> : undefined}>
        <div className="flex flex-col gap-4">
          <input
            className="field text-[16px]"
            type="search"
            placeholder="ex. Lidl, chirie, cadou…"
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
            aria-label="Text căutat"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tip">
              <select className="field" value={f.kind} onChange={(e) => set({ kind: e.target.value as Filters["kind"], category_id: "" })}>
                <option value="">Toate</option>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Categorie">
              <select className="field" value={f.category_id} onChange={(e) => set({ category_id: e.target.value })}>
                <option value="">Toate</option>
                {kindCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="De la luna">
              <input className="field" type="month" value={f.from} onChange={(e) => set({ from: e.target.value })} />
            </Field>
            <Field label="Până la luna">
              <input className="field" type="month" value={f.to} onChange={(e) => set({ to: e.target.value })} />
            </Field>
            <Field label="Suma minimă">
              <input className="field num" inputMode="decimal" placeholder="0" value={f.min} onChange={(e) => set({ min: e.target.value.replace(/[^\d.,]/g, "") })} />
            </Field>
            <Field label="Suma maximă">
              <input className="field num" inputMode="decimal" placeholder="fără limită" value={f.max} onChange={(e) => set({ max: e.target.value.replace(/[^\d.,]/g, "") })} />
            </Field>
            <label className="flex min-h-[40px] items-center gap-2.5 self-end text-[14px] text-ink-soft">
              <input type="checkbox" className="h-[18px] w-[18px] shrink-0" checked={f.refunds} onChange={(e) => set({ refunds: e.target.checked })} />
              Doar retururi (bani înapoi)
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => {
              const on = f.from === p.from && f.to === p.to;
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1 text-[13px] ${on ? "border-ink bg-ink text-sheet" : "border-line-strong/70 text-ink-soft"}`}
                  onClick={() => set(on ? { from: "", to: "" } : { from: p.from, to: p.to })}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      {!data && !error ? (
        <div className="mt-6"><Skeleton variant="block" /></div>
      ) : error ? (
        <p className="mt-6 rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu" role="alert">{error}</p>
      ) : data && t ? (
        <>
          <div className={`panel mt-6 ${STAT_STRIP} sm:grid-cols-4`} aria-busy={loading}>
            <Stat label="Intrări găsite" accent="var(--c-ink-faint)"><span className="num text-[22px] font-semibold">{t.count}</span></Stat>
            <Stat label="Cheltuieli" accent="var(--c-rosu)" hint={t.refunds > 0 ? `după ${lei(t.refunds)} retururi` : undefined}><Money value={spent} size="lg" /></Stat>
            <Stat label="Venituri" accent="var(--c-leu)"><Money value={t.income} size="lg" /></Stat>
            <Stat label="Economii" accent="var(--c-galben)"><Money value={t.saving} size="lg" /></Stat>
          </div>

          <Panel className="mt-6" title="Rezultate" summary={`${t.count} intrări`}>
            {data.rows.length === 0 ? (
              <Empty title="Nicio intrare">Încearcă alt text sau o perioadă mai lungă.</Empty>
            ) : (
              <>
                <ul className="flex flex-col">
                  {data.rows.map((e) => {
                    const cat = e.category_id ? catMap.get(e.category_id) : undefined;
                    const name = e.kind === "saving" ? "Economii" : e.category ?? "Fără categorie";
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          className="-mx-2 flex min-h-[48px] w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 text-left hover:bg-ink/3"
                          onClick={() => quickAdd({ entry: { ...e, currency: e.currency === "EUR" ? "EUR" : "RON" } })}
                          aria-label={`${name}, ${lei(e.ron)}, modifică`}
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: cat?.color ?? "var(--c-ink-faint)" }} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px]">
                              {name}
                              {e.description && <span className="ml-2 text-[12.5px] text-ink-faint">{e.description}</span>}
                            </span>
                            <span className="block text-[12px] text-ink-faint">
                              {[e.day ? fmtDay(e.day) : monthLabel(e.month), KIND_LABEL[e.kind], e.amount < 0 ? "retur" : ""].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className={`num shrink-0 text-right text-[14px] font-medium ${e.amount < 0 ? "text-leu" : ""}`}>
                            {e.currency === "EUR" ? eur(e.amount) : lei(e.amount)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {data.truncated && (
                  <p className="mt-3 text-[12.5px] text-ink-faint">
                    Se văd primele {data.rows.length} intrări. Totalurile și fișierul CSV le cuprind pe toate {t.count}.
                  </p>
                )}
              </>
            )}
          </Panel>
        </>
      ) : null}
    </>
  );
}

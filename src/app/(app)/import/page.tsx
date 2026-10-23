"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ImportCategory } from "@/lib/importRules";
import type { PreviewRow } from "@/lib/importServer";
import type { Mapping } from "@/lib/statementImport";
import { KIND_LABEL, lei, type Kind } from "@/lib/util";
import { api, Empty, Field, PageHeader, Panel, Toast, TrashIcon, useApi } from "@/components/ui";

type NeedsMapping = { status: "needs-mapping"; signature: string; header: number; headers: string[]; sample: string[][]; guess: Partial<Mapping> };
type Parsed = { status: "ok"; bank: string; filename: string; rows: PreviewRow[]; categories: ImportCategory[] };
type Rule = { id: number; pattern: string; category_id: number; category: string };
type Row = PreviewRow & { include: boolean; chosen: number | null };

const fmtDate = (d: string) => d.split("-").reverse().join(".");
const SUPPORTED = new Set(["RON", "EUR"]);

/**
 * Importul extraselor de cont (beta): încarci CSV-ul sau Excel-ul din aplicația băncii, verifici categoriile
 * propuse și confirmi. Categoriile corectate devin reguli pentru importurile următoare.
 */
export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mappingStep, setMappingStep] = useState<NeedsMapping | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: number; rules: number; months: string[] } | null>(null);
  const rules = useApi<Rule[]>("/api/import/rules");

  const read = async (f: File, mapping?: { signature: string; mapping: Mapping }) => {
    setError(null);
    setDone(null);
    setBusy("read");
    try {
      const fd = new FormData();
      fd.append("file", f);
      if (mapping) fd.append("mapping", JSON.stringify(mapping));
      const res = await fetch("/api/import/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extrasul nu a putut fi citit.");
      if (data.status === "needs-mapping") {
        setParsed(null);
        setMappingStep(data);
      } else {
        setMappingStep(null);
        setParsed(data);
        setRows(
          (data as Parsed).rows.map((r) => ({
            ...r,
            chosen: r.categoryId,
            include: !r.duplicate && SUPPORTED.has(r.currency),
          })),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extrasul nu a putut fi citit.");
    } finally {
      setBusy(null);
    }
  };

  const pick = (f: File) => {
    setFile(f);
    setParsed(null);
    setMappingStep(null);
    read(f);
  };

  const included = rows.filter((r) => r.include);
  const missing = included.filter((r) => r.chosen === null).length;
  const totals = useMemo(
    () => ({
      out: included.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0),
      in: included.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0),
    }),
    [included],
  );
  const duplicates = rows.filter((r) => r.duplicate).length;

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      const res = await api<{ imported: number; skipped: number; rules: number }>("/api/import/commit", "POST", {
        rows: included.map((r) => ({
          hash: r.hash, date: r.date, amount: r.amount, currency: r.currency, description: r.description, categoryId: r.chosen,
          // Se învață doar ce a ales utilizatorul: o categorie schimbată sau una pusă unde nu propuneam nimic.
          learn: r.chosen !== r.categoryId || r.source === null,
        })),
      });
      const months = [...new Set(included.map((r) => r.date.slice(0, 7)))].sort();
      setDone({ ...res, months });
      setParsed(null);
      setRows([]);
      setFile(null);
      rules.reload();
      setToast(`Am importat ${res.imported} ${res.imported === 1 ? "tranzacție" : "tranzacții"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tranzacțiile nu au putut fi salvate.");
    } finally {
      setBusy(null);
    }
  };

  const update = (hash: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.hash === hash ? { ...r, ...patch } : r)));

  const deleteRule = async (id: number) => {
    await api(`/api/import/rules?id=${id}`, "DELETE");
    rules.reload();
  };

  if (rules.error && /nu există/i.test(rules.error)) {
    return <Empty title="Pagina nu există">Importul extraselor e disponibil doar în versiunea beta.</Empty>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Import extras de cont"
        intro="Încarcă extrasul descărcat din aplicația băncii (CSV sau Excel). Verifici categoriile propuse, iar tranzacțiile intră în luna lor."
      />

      <Panel title="1. Fișierul">
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) pick(f);
          }}
          className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-line bg-paper/50 p-6 text-center transition-colors hover:border-leu hover:bg-leu-tint/10"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
              e.target.value = "";
            }}
          />
          <div className="mb-1 text-[26px]" aria-hidden>🏦</div>
          <div className="text-[14px] font-semibold text-ink">
            {busy === "read" ? "Se citește extrasul…" : file ? `„${file.name}”: alege alt fișier` : "Apasă aici sau trage extrasul de la bancă"}
          </div>
          <div className="mt-1 text-[12px] text-ink-soft">.csv sau .xlsx · recunoaște automat ING și BCR George; pentru alte bănci alegi coloanele o singură dată</div>
        </div>
        {error && <div className="mt-3 rounded-md bg-rosu-tint p-3 text-[13px] font-medium text-rosu">{error}</div>}
        {done && (
          <div className="mt-3 rounded-md border border-leu/40 bg-leu-tint/20 p-3 text-[13px] text-ink">
            Am importat <strong>{done.imported}</strong> {done.imported === 1 ? "tranzacție" : "tranzacții"}
            {done.skipped > 0 && <> ({done.skipped} existau deja și au fost sărite)</>}
            {done.rules > 0 && <> și am reținut {done.rules} {done.rules === 1 ? "regulă nouă" : "reguli noi"}</>}.{" "}
            {done.months.length > 0 && <Link href="/luna" className="font-semibold text-leu hover:underline">Vezi luna →</Link>}
          </div>
        )}
      </Panel>

      {mappingStep && file && <MappingStep step={mappingStep} busy={busy === "read"} onSubmit={(m) => read(file, { signature: mappingStep.signature, mapping: m })} />}

      {parsed && (
        <Panel
          title={`2. Verifică (${parsed.bank})`}
          aside={<span className="text-[12px] text-ink-faint">{rows.length} tranzacții{duplicates > 0 && ` · ${duplicates} importate deja`}</span>}
          pad={false}
        >
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-[13px] sm:px-5">
            <span>Selectate: <strong>{included.length}</strong></span>
            <span>Plăți: <strong className="tabular-nums text-rosu">{lei(totals.out)}</strong></span>
            <span>Încasări: <strong className="tabular-nums text-leu">{lei(totals.in)}</strong></span>
            {missing > 0 && (
              <button className="btn-ghost py-1 text-[12px]" onClick={() => setRows((rs) => rs.map((r) => (r.include && r.chosen === null ? { ...r, include: false } : r)))}>
                Scoate cele {missing} fără categorie
              </button>
            )}
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {rows.map((r) => (
              <PreviewItem key={r.hash} row={r} categories={parsed.categories} onChange={(p) => update(r.hash, p)} />
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-[12px] text-ink-faint">
              {missing > 0
                ? `Alege categoria pentru ${missing} ${missing === 1 ? "tranzacție" : "tranzacții"} sau debifează-le.`
                : "Categoriile pe care le schimbi se rețin pentru importurile următoare."}
            </p>
            <button className="btn-primary" disabled={!included.length || missing > 0 || busy === "save"} onClick={save}>
              {busy === "save" ? "Se salvează…" : `Importă ${included.length} ${included.length === 1 ? "tranzacție" : "tranzacții"}`}
            </button>
          </div>
        </Panel>
      )}

      <Panel title="Reguli învățate" summary={rules.data ? `${rules.data.length} reguli` : undefined}>
        {!rules.data?.length ? (
          <p className="text-[13px] text-ink-soft">
            Încă nu ai reguli. Când schimbi categoria unei tranzacții la import, Leuța o ține minte pentru comerciantul respectiv.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rules.data.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0 truncate">
                  <span className="font-mono">„{r.pattern}”</span> <span className="text-ink-faint">→</span> {r.category}
                </span>
                <button className="btn-ghost h-8 w-8 shrink-0 px-0 text-rosu" onClick={() => deleteRule(r.id)} aria-label={`Șterge regula ${r.pattern}`}>
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function PreviewItem({ row, categories, onChange }: { row: Row; categories: ImportCategory[]; onChange: (p: Partial<Row>) => void }) {
  const options = categories.filter((c) => (row.amount > 0 ? c.kind === "income" : c.kind !== "income"));
  const groups = [...new Set(options.map((c) => c.kind))] as Kind[];
  const unsupported = !SUPPORTED.has(row.currency);
  const disabled = row.duplicate || unsupported;
  return (
    <li className={`grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[auto_5.5rem_1fr_7rem_14rem] sm:px-5 ${row.include ? "" : "opacity-55"}`}>
      <input
        type="checkbox"
        className="h-4 w-4 accent-(--c-leu)"
        checked={row.include}
        disabled={disabled}
        onChange={(e) => onChange({ include: e.target.checked })}
        aria-label={`Importă ${row.description}`}
      />
      <span className="hidden text-[12px] tabular-nums text-ink-soft sm:block">{fmtDate(row.date)}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium text-ink" title={row.details}>{row.description}</span>
        <span className="block text-[11.5px] text-ink-faint">
          <span className="sm:hidden">{fmtDate(row.date)} · </span>
          {row.duplicate ? "importată deja" : unsupported ? `monedă nesuportată (${row.currency})` : row.source === "rule" ? "categorie din regula ta" : row.source === "auto" ? "categorie propusă" : "fără categorie"}
        </span>
      </span>
      <span className={`text-right text-[13.5px] font-semibold tabular-nums ${row.amount < 0 ? "text-rosu" : "text-leu"}`}>
        {row.amount > 0 ? "+" : "−"}
        {lei(Math.abs(row.amount))}
        {row.currency !== "RON" && <span className="ml-1 text-[11px] font-normal text-ink-faint">{row.currency}</span>}
      </span>
      <select
        className="field col-span-3 py-1.5 text-[13px] sm:col-span-1"
        value={row.chosen ?? ""}
        disabled={disabled}
        onChange={(e) => onChange({ chosen: e.target.value ? Number(e.target.value) : null, include: true })}
        aria-label={`Categoria pentru ${row.description}`}
      >
        <option value="">Alege categoria…</option>
        {groups.map((k) => (
          <optgroup key={k} label={KIND_LABEL[k]}>
            {options.filter((c) => c.kind === k).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </li>
  );
}

/** Pentru extrasele cu antet necunoscut: utilizatorul spune care coloană e data, suma și descrierea. */
function MappingStep({ step, busy, onSubmit }: { step: NeedsMapping; busy: boolean; onSubmit: (m: Mapping) => void }) {
  const g = step.guess;
  const [date, setDate] = useState<number | "">(g.date ?? "");
  const [split, setSplit] = useState(g.amount === undefined && (g.debit !== undefined || g.credit !== undefined));
  const [amount, setAmount] = useState<number | "">(g.amount ?? "");
  const [debit, setDebit] = useState<number | "">(g.debit ?? "");
  const [credit, setCredit] = useState<number | "">(g.credit ?? "");
  const [description, setDescription] = useState<number[]>(g.description ?? []);
  const [currency, setCurrency] = useState<number | "">(g.currency ?? "");
  useEffect(() => setDescription(step.guess.description ?? []), [step]);

  const cols = step.headers.map((h, i) => ({ i, label: h || `Coloana ${i + 1}` }));
  const select = (value: number | "", set: (v: number | "") => void, label: string, optional = false) => (
    <Field label={label}>
      <select className="field" value={value} onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))}>
        <option value="">{optional ? "— nu există —" : "Alege coloana…"}</option>
        {cols.map((c) => <option key={c.i} value={c.i}>{c.label}</option>)}
      </select>
    </Field>
  );
  const ready = date !== "" && description.length > 0 && (split ? debit !== "" || credit !== "" : amount !== "");

  const submit = () => {
    if (date === "" || !ready) return;
    const m: Mapping = { header: step.header, date, description };
    if (split) {
      if (debit !== "") m.debit = debit;
      if (credit !== "") m.credit = credit;
    } else if (amount !== "") m.amount = amount;
    if (currency !== "") m.currency = currency;
    onSubmit(m);
  };

  return (
    <Panel title="Alege coloanele">
      <p className="mb-4 text-[13px] text-ink-soft">
        N-am recunoscut formatul acestui extras. Spune-mi o singură dată ce conține fiecare coloană; data viitoare îl citesc singură.
      </p>
      <div className="mb-4 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-[12px]">
          <thead className="bg-paper/60">
            <tr>{cols.map((c) => <th key={c.i} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {step.sample.map((r, k) => (
              <tr key={k} className="border-t border-line">
                {cols.map((c) => <td key={c.i} className="max-w-[16rem] truncate whitespace-nowrap px-2 py-1 text-ink-soft">{r[c.i]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {select(date, setDate, "Data tranzacției")}
        <Field label="Suma">
          <div className="flex gap-2 text-[13px]">
            <label className="flex items-center gap-1.5"><input type="radio" checked={!split} onChange={() => setSplit(false)} /> o coloană, cu minus la plăți</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={split} onChange={() => setSplit(true)} /> debit și credit separat</label>
          </div>
        </Field>
        {split ? (
          <>
            {select(debit, setDebit, "Debit (plăți)", true)}
            {select(credit, setCredit, "Credit (încasări)", true)}
          </>
        ) : (
          select(amount, setAmount, "Coloana cu suma")
        )}
        {select(currency, setCurrency, "Moneda (opțional)", true)}
      </div>
      <div className="mt-3">
        <span className="label">Descrierea (una sau mai multe coloane)</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
          {cols.map((c) => (
            <label key={c.i} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={description.includes(c.i)}
                onChange={(e) => setDescription((d) => (e.target.checked ? [...d, c.i].sort((a, b) => a - b) : d.filter((x) => x !== c.i)))}
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>
      <button className="btn-primary mt-4" disabled={!ready || busy} onClick={submit}>
        {busy ? "Se citește…" : "Citește extrasul"}
      </button>
    </Panel>
  );
}

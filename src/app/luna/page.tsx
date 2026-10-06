"use client";

import Link from "next/link";
import { useState } from "react";
import type { Summary } from "@/lib/analytics";
import { addMonths, eur, KIND_LABEL, lei, money, monthLabel, type Currency, type Kind } from "@/lib/util";
import { api, downloadFile, Money, PageHeader, Panel, Toast, useApi, useApp } from "@/components/ui";
import { Leader } from "@/components/receipt";
import { useQuickAdd } from "@/components/QuickAdd";

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
    // Telefon: categoria și descrierea pe câte un rând întreg, apoi suma + moneda, apoi „Lunar” + butoanele.
    // Ecran mare: totul pe un singur rând.
    <form
      className="grid grid-cols-[1fr_92px] gap-2 sm:grid-cols-[1.3fr_1.5fr_1fr_80px_auto_auto] [&>*:nth-child(-n+2)]:col-span-2 sm:[&>*:nth-child(-n+2)]:col-span-1"
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
      <div className="col-span-2 flex items-center justify-between gap-2 sm:contents">
        <label className="flex min-h-[40px] items-center gap-2 text-[14px] text-ink-soft sm:min-h-0 sm:gap-1.5 sm:text-[13px]" title="Se copiază în luna următoare">
          <input type="checkbox" className="h-[18px] w-[18px] sm:h-auto sm:w-auto" checked={draft.recurring} onChange={(e) => setDraft({ ...draft, recurring: e.target.checked })} />
          Lunar
        </label>
        <div className="flex justify-end gap-1">
          {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Renunță</button>}
          <button type="submit" className="btn-primary min-w-[96px]">{submitLabel}</button>
        </div>
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
  const quickAdd = useQuickAdd();
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
      aside={<span className="num font-semibold">{lei(total)}</span>}
    >
      <p className="mb-4 text-[13px] text-ink-soft">{info.help}</p>
      {entries.length > 0 && (
        <ul className="mb-1">
          {entries.map((e) =>
            editId === e.id ? (
              <li key={e.id} className="py-2.5">
                <EntryForm kind={kind} draft={edit} setDraft={setEdit} cats={cats} goals={goals} invs={invs}
                  onSubmit={save} submitLabel="Salvează" onCancel={() => setEditId(null)} />
              </li>
            ) : (
              // Rând de bon: categoria ...... suma; descrierea dedesubt, mai mică.
              // Pe telefon tot rândul e un buton: atingerea deschide modificarea (cu ștergerea în aceeași fereastră).
              <li key={e.id} className="group relative -mx-2 flex items-start gap-2.5 rounded-md px-2 py-2 sm:mx-0 sm:gap-3 sm:px-0 sm:py-1.5">
                <button
                  type="button"
                  className="absolute inset-0 z-[1] rounded-md active:bg-ink/[0.06] sm:hidden"
                  onClick={() => quickAdd({ entry: e })}
                  aria-label={`Modifică ${kind === "saving" ? nameOfDest(e) : catMap.get(e.category_id ?? 0)?.name ?? "intrarea"}, ${e.currency === "EUR" ? eur(e.amount) : lei(e.amount)}`}
                />
                <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: kind === "saving" ? info.color : catMap.get(e.category_id ?? 0)?.color ?? "var(--c-ink-faint)" }} />
                <div className="min-w-0 flex-1 pt-px">
                  <Leader
                    label={
                      <span className="line-clamp-2 leading-snug">
                        {kind === "saving" ? nameOfDest(e) : catMap.get(e.category_id ?? 0)?.name ?? "Fără categorie"}
                      </span>
                    }
                    value={e.currency === "EUR" ? eur(e.amount) : lei(e.amount)}
                  />
                  {(e.description || e.recurring || e.currency === "EUR") && (
                    <div className="flex items-baseline justify-between gap-3 text-[12.5px] text-ink-soft">
                      <span className="min-w-0 truncate">
                        {e.recurring ? <span className="mr-1.5 rounded-sm border border-albastru/40 px-1 font-mono text-[10px] uppercase tracking-wide text-albastru">lunar</span> : null}
                        {e.description}
                      </span>
                      {e.currency === "EUR" && <span className="num shrink-0 text-ink-faint">= {lei(e.amount * rate)}</span>}
                    </div>
                  )}
                </div>
                {/* Pe ecran mare: butoane text, vizibile la hover. Pe telefon se atinge rândul. */}
                <div className="hidden shrink-0 justify-end sm:flex sm:w-[8.5rem] sm:opacity-60 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                  <button
                    className="btn-ghost px-2"
                    aria-label="Editează"
                    title="Editează"
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
                  <button className="btn-danger px-2" onClick={() => remove(e)} aria-label="Șterge" title="Șterge">
                    Șterge
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {entries.length > 0 && (
        <div className="mb-4">
          <div className="rule-dashed" aria-hidden />
          {/* Aliniat cu sumele de deasupra: același spațiu stânga (pătratul colorat) și dreapta (butoanele). */}
          <div className="flex gap-2.5 pt-2 sm:gap-3">
            <span className="w-2.5 shrink-0" />
            <Leader className="min-w-0 flex-1" strong label={<span className="font-mono text-[13px] uppercase tracking-[0.06em]">Subtotal</span>} value={lei(total)} />
            <span className="hidden shrink-0 sm:block sm:w-[8.5rem]" />
          </div>
        </div>
      )}
      <div className="hidden sm:block">
        <EntryForm kind={kind} draft={draft} setDraft={setDraft} cats={cats} goals={goals} invs={invs} onSubmit={add} submitLabel="Adaugă" />
      </div>
      <button
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-[14px] font-medium text-ink-soft active:bg-paper sm:hidden"
        onClick={() => quickAdd({ kind })}
      >
        <span className="text-[18px] leading-none" aria-hidden>+</span> Adaugă la {KIND_LABEL[kind].toLowerCase()}
      </button>
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

  const [downloading, setDownloading] = useState(false);
  const downloadReceipt = async () => {
    setDownloading(true);
    try {
      await downloadFile(`/api/receipt?month=${month}`, `Leuta-bon-${month}.pdf`);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setDownloading(false);
    }
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
        actions={
          <>
            {/* Copierea e pasul principal doar într-o lună goală; după aceea devine o acțiune secundară. */}
            <button className={`${entries && entries.length > 0 ? "btn-ghost" : "btn-primary"} basis-full sm:basis-auto`} onClick={copyPrev}>
              Copiază intrările lunare din {monthLabel(addMonths(month, -1))}
            </button>
            <button className="btn-ghost basis-full border border-line bg-field/60 sm:basis-auto" onClick={downloadReceipt} disabled={downloading}>
              {downloading ? "Se generează…" : "🧾 Bonul lunii (PDF)"}
            </button>
          </>
        }
      />

      {/* Pe telefon bilanțul complet e la final; sus rămâne doar esențialul lunii. */}
      {t && (
        <div className="panel mb-6 grid grid-cols-3 divide-x divide-dashed divide-line-strong px-1 py-3 text-center xl:hidden">
          {[
            { label: "Intrat", value: t.income, cls: "text-ink" },
            { label: "Ieșit", value: t.income - t.unallocated, cls: "text-ink" },
            { label: t.unallocated >= 0 ? "Rămas" : "Depășire", value: t.unallocated, cls: t.unallocated < 0 ? "text-rosu" : "text-leu" },
          ].map((x) => (
            <div key={x.label} className="min-w-0 px-1.5">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">{x.label}</div>
              <div className={`num mt-0.5 truncate text-[14px] font-semibold ${x.cls}`}>
                {money(x.value)}<span className="ml-0.5 text-[10px] font-normal text-ink-faint">lei</span>
              </div>
            </div>
          ))}
        </div>
      )}

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
              <div className="flex flex-col gap-2.5">
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
                <div className="mt-1.5">
                  <div className="rule-double" aria-hidden />
                  <div className="flex items-end justify-between gap-3 pt-2.5">
                    <span className="receipt-title pb-1 text-[12.5px]">{t.unallocated >= 0 ? "Rest nealocat" : "Depășire"}</span>
                    <span className="text-right"><Money value={t.unallocated} rate={rate} size="lg" tone={t.unallocated < 0 ? "rosu" : "leu"} /></span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-ink-soft">Se calculează…</p>
            )}
          </Panel>

          {/* Widget Card Tichete de Masă & Buget Alimente */}
          <Panel title="Card Tichete de Masă & Alimente">
            <div className="flex flex-col gap-2.5 text-[13px]">
              <Leader label={<span className="text-ink-soft">Tichete încărcate</span>} value={<span className="font-semibold text-leu">{lei(mealTicketTotal)}</span>} />
              <Leader label={<span className="text-ink-soft">Alimente, total</span>} value={<span className="font-semibold">{lei(foodTotal)}</span>} />
              <div className="rule-dashed" aria-hidden />
              <Leader label={<span className="text-ink-soft">Din bani proprii</span>} value={<span className="font-semibold text-mov">{lei(outOfPocketFood)}</span>} />
              {foodTotal > 0 ? (
                <div className="mt-1 rounded-sm border border-dashed border-line-strong p-2 text-[12px] text-ink-soft">
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
    <Leader
      className="text-[14px]"
      label={
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      }
      value={lei(value)}
      sub={eur(value / rate)}
    />
  );
}

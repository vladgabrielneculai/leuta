"use client";

import Link from "next/link";
import { useState } from "react";
import type { Summary } from "@/lib/analytics";
import { addMonths, eur, KIND_LABEL, lei, money, monthLabel, type Currency, type Kind } from "@/lib/util";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api, Bar, chartTooltipStyle, CollapsiblePanels, downloadFile, PageHeader, Panel, PencilIcon, Toast, useApi, useApp, useTab } from "@/components/ui";
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
  variable: { color: "var(--c-rosu)", help: "Tot ce variază de la o lună la alta: mâncare, benzină, ieșiri, neprevăzute. Utilitățile (apă, curent, gaze, întreținere) se trec aici, conform facturilor." },
  saving: { color: "var(--c-galben)", help: "Bani mutați spre un obiectiv, fondul de urgență sau o investiție. Plățile anticipate se înregistrează la credit." },
};

/**
 * O secțiune a lunii (venituri, costuri fixe…): rândurile ca pe un bon, iar adăugarea, modificarea și ștergerea
 * se fac în aceeași fereastră (adăugarea rapidă), pe orice ecran. Așa pagina nu mai are câte un formular
 * deschis în fiecare secțiune și butoane „Editează / Șterge” pe fiecare rând.
 */
// Ordinea dalelor: banii care intră, apoi cei care ies, apoi economiile. Implicit se deschid cheltuielile (cele mai dese).
const KIND_ORDER: Kind[] = ["income", "fixed", "variable", "saving"];
const KIND_SHORT: Record<Kind, string> = { income: "Venituri", fixed: "Fixe", variable: "Cheltuieli", saving: "Economii" };

function KindSection({
  kind, entries, cats, goals, invs, rate, tour,
}: {
  tour?: string;
  kind: Kind;
  entries: Entry[];
  cats: Category[];
  goals: Goal[];
  invs: Investment[];
  rate: number;
}) {
  const quickAdd = useQuickAdd();
  const info = KIND_INFO[kind];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const nameOfDest = (e: Entry) =>
    e.goal_id ? goals.find((g) => g.id === e.goal_id)?.name : e.investment_id ? invs.find((i) => i.id === e.investment_id)?.name : "Economii generale";
  const total = entries.reduce((s, e) => s + (e.currency === "EUR" ? e.amount * rate : e.amount), 0);

  return (
    <Panel tour={tour}>
      {/* Explicația secțiunii apare doar cât timp e goală. */}
      {entries.length === 0 && <p className="mb-3 text-[13px] text-ink-soft">{info.help}</p>}
      {entries.length > 0 && (
        <ul className="-mt-1 mb-2 divide-y divide-dashed divide-line">
          {entries.map((e) => {
            const name = kind === "saving" ? nameOfDest(e) : catMap.get(e.category_id ?? 0)?.name ?? "Fără categorie";
            return (
              // Un singur rând: categoria, descrierea (estompată, tăiată dacă e lungă) și suma. Tot rândul e un buton:
              // atingerea (sau clicul) deschide modificarea, cu ștergerea în aceeași fereastră.
              <li key={e.id} className="group relative -mx-2 flex min-h-[44px] items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-ink/[0.03] sm:min-h-[38px]">
                <button
                  type="button"
                  className="absolute inset-0 z-[1] rounded-md active:bg-ink/[0.06]"
                  onClick={() => quickAdd({ entry: e })}
                  aria-label={`Modifică ${name}, ${e.currency === "EUR" ? eur(e.amount) : lei(e.amount)}`}
                  title={[e.description, e.recurring ? "se repetă lunar" : "", "atinge pentru a modifica sau șterge"].filter(Boolean).join(" · ")}
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: kind === "saving" ? info.color : catMap.get(e.category_id ?? 0)?.color ?? "var(--c-ink-faint)" }} />
                <span className="min-w-0 flex-1 truncate text-[14px]">
                  {name}
                  {e.description && <span className="ml-2 hidden text-[12.5px] text-ink-faint sm:inline">{e.description}</span>}
                </span>
                {e.recurring ? (
                  <span className="shrink-0 text-[13px] text-albastru" title="Se repetă lunar" aria-label="lunar">↻</span>
                ) : null}
                <span className="num shrink-0 text-right text-[14px] font-medium">
                  {e.currency === "EUR" ? eur(e.amount) : lei(e.amount)}
                  {e.currency === "EUR" && <span className="block text-[11px] font-normal text-ink-faint">= {lei(e.amount * rate)}</span>}
                </span>
                <span className="hidden shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 sm:block" aria-hidden>
                  <PencilIcon />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <button
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-[14px] font-medium text-ink-soft transition-colors hover:border-ink-faint hover:text-ink active:bg-paper sm:min-h-[40px]"
        onClick={() => quickAdd({ kind })}
      >
        <span className="text-[18px] leading-none" aria-hidden>+</span> Adaugă la {KIND_LABEL[kind].toLowerCase()}
      </button>
    </Panel>
  );
}

export default function MonthPage() {
  const { month, bump, eurRate } = useApp();
  const [kind, setKind] = useTab<Kind>("luna", "variable", KIND_ORDER);
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
        intro="Ce a intrat și ce a ieșit luna aceasta. Atinge un rând ca să-l modifici."
        actions={
          <>
            {/* Copierea e pasul principal doar într-o lună goală; după aceea devine o acțiune secundară. */}
            <button data-tour="luna-copy" className={entries && entries.length > 0 ? "btn-ghost" : "btn-primary"} onClick={copyPrev} title={`Copiază intrările marcate „lunar” din ${monthLabel(addMonths(month, -1))}`}>
              <span className="sm:hidden">Copiază lunarele</span>
              <span className="hidden sm:inline">Copiază intrările lunare din {monthLabel(addMonths(month, -1))}</span>
            </button>
            <button className="btn-ghost border border-line bg-field/60" onClick={downloadReceipt} disabled={downloading}>
              {downloading ? "Se generează…" : "🧾 Bonul lunii (PDF)"}
            </button>
          </>
        }
      />

      {/* Pe telefon bilanțul complet e la final; sus rămâne doar esențialul lunii. */}
      {t && (
        <div data-tour="luna-balance" className="panel mb-6 grid grid-cols-3 divide-x divide-dashed divide-line-strong px-1 py-3 text-center xl:hidden">
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
        <div className="flex min-w-0 flex-col gap-3">
          {!entries || !cats || !goals || !invs ? (
            <p className="text-ink-soft">Se încarcă…</p>
          ) : (
            <>
              {/* Câte o secțiune odată: dalele arată totalul fiecăreia, iar lista de dedesubt e scurtă. */}
              <div role="tablist" aria-label="Secțiunile lunii" className="grid grid-cols-4 gap-1.5 sm:gap-2" data-tour="luna-tabs">
                {KIND_ORDER.map((k) => {
                  const on = k === kind;
                  const sum = entries.filter((e) => e.kind === k).reduce((a, e) => a + (e.currency === "EUR" ? e.amount * rate : e.amount), 0);
                  return (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setKind(k)}
                      title={KIND_INFO[k].help}
                      className={`min-w-0 rounded-md border px-2 py-2 text-left transition-colors sm:px-3 ${
                        on ? "border-ink bg-sheet shadow-[0_1px_3px_rgb(var(--shadow)/0.15)]" : "border-line bg-sheet/50 hover:bg-sheet"
                      }`}
                    >
                      <span className="mb-1 block h-1 w-6 rounded-full" style={{ background: KIND_INFO[k].color, opacity: on ? 1 : 0.5 }} aria-hidden />
                      <span className={`block truncate text-[12px] sm:text-[13px] ${on ? "font-semibold text-ink" : "text-ink-soft"}`}>
                        <span className="sm:hidden">{KIND_SHORT[k]}</span>
                        <span className="hidden sm:inline">{KIND_LABEL[k]}</span>
                      </span>
                      <span className="num block truncate text-[12.5px] font-medium text-ink sm:text-[14px]">
                        {/* Pe telefon fără zecimale, ca suma să încapă în dală. */}
                        <span className="sm:hidden">{Math.round(sum).toLocaleString("ro-RO")}</span>
                        <span className="hidden sm:inline">{money(sum)}</span>
                        <span className="ml-0.5 text-[10px] font-normal text-ink-faint">lei</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <KindSection
                key={kind}
                kind={kind}
                tour="luna-section"
                rate={rate}
                entries={entries.filter((e) => e.kind === kind)}
                cats={cats.filter((c) => c.kind === kind)}
                goals={goals}
                invs={investmentsEnabled ? invs : []}
              />
            </>
          )}
        </div>

        {/* Pe telefon, rezumatul de sus ține locul bilanțului; graficul și tichetele se deschid la atingere. */}
        <CollapsiblePanels>
        <aside className="xl:sticky xl:top-8 xl:self-start flex flex-col gap-3 lg:gap-5">
          <Panel title="Bilanțul lunii" tour="luna-balance" summary={t ? `Grafic: unde s-au dus ${money(t.income)} lei` : undefined}>
            {t ? (
              <MonthBalance
                rate={rate}
                unallocated={t.unallocated}
                hasLoans={s!.loans.length > 0}
                parts={[
                  { label: "Costuri fixe", value: t.fixed, color: "var(--c-albastru)" },
                  { label: "Rate credite", value: t.loanPayments + t.loanInsurance, color: "var(--c-mov)", auto: true },
                  { label: "Cheltuieli variabile", value: t.variable, color: "var(--c-rosu)" },
                  { label: investmentsEnabled ? "Economii și investiții" : "Economii", value: t.savings + (investmentsEnabled ? t.investments : 0), color: "var(--c-galben)" },
                  { label: "Plăți anticipate", value: t.prepayments, color: "rgb(var(--galben) / 0.55)" },
                  { label: "Comisioane rambursare", value: t.prepayFees, color: "rgb(var(--mov) / 0.55)" },
                ]}
                income={t.income}
              />
            ) : (
              <p className="text-ink-soft">Se calculează…</p>
            )}
          </Panel>

          {/* Cât din mâncare acoperă tichetele: o bară în loc de trei rânduri de cifre. */}
          <Panel title="Tichete de masă și alimente" summary={foodTotal > 0 ? `Acoperă ${Math.min(100, Math.round((mealTicketTotal / foodTotal) * 100))}% din mâncare` : undefined}>
            {foodTotal > 0 || mealTicketTotal > 0 ? (
              <div className="flex flex-col gap-2 text-[13px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-ink-soft">Tichetele acoperă</span>
                  <span className="num font-display text-[20px] font-semibold text-leu">
                    {foodTotal > 0 ? Math.min(100, Math.round((mealTicketTotal / foodTotal) * 100)) : 100}%
                  </span>
                </div>
                <Bar value={mealTicketTotal} max={Math.max(foodTotal, mealTicketTotal)} color="var(--c-leu)" />
                <div className="num flex justify-between gap-2 text-[12px] text-ink-soft">
                  <span>Tichete {lei(mealTicketTotal)}</span>
                  <span>Alimente {lei(foodTotal)}</span>
                </div>
                {outOfPocketFood > 0 && (
                  <p className="text-[12px] text-ink-soft">
                    Din bani proprii: <strong className="num text-mov">{lei(outOfPocketFood)}</strong>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-ink-soft">
                Introdu cheltuielile cu alimentele și tichetele lunare pentru calculul automat.
              </p>
            )}
          </Panel>

          <Toast message={toast} onDone={() => setToast(null)} />
        </aside>
        </CollapsiblePanels>
      </div>
    </>
  );
}

type BalancePart = { label: string; value: number; color: string; auto?: boolean };

/**
 * Bilanțul lunii ca grafic: inelul arată cum s-a împărțit venitul, iar în mijloc e restul nealocat.
 * Sub el, aceleași sume pe rânduri scurte (în euro la trecerea cu mouse-ul).
 */
function MonthBalance({ income, unallocated, parts, rate, hasLoans }: { income: number; unallocated: number; parts: BalancePart[]; rate: number; hasLoans: boolean }) {
  const shown = parts.filter((p) => p.value > 0);
  const data = [...shown, ...(unallocated > 0 ? [{ label: "Nealocat", value: unallocated, color: "var(--c-line)" }] : [])];
  const over = unallocated < 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto h-[170px] w-[170px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data.length ? data : [{ label: "Gol", value: 1, color: "var(--c-line)" }]} dataKey="value" nameKey="label" innerRadius={58} outerRadius={80} paddingAngle={data.length > 1 ? 1.5 : 0} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
              {(data.length ? data : [{ label: "Gol", value: 1, color: "var(--c-line)" }]).map((d) => <Cell key={d.label} fill={d.color} />)}
            </Pie>
            {data.length > 0 && <Tooltip {...chartTooltipStyle} formatter={(v: number) => lei(v)} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">{over ? "Depășire" : "Rămas"}</span>
          <span className={`num font-display text-[19px] font-semibold leading-tight ${over ? "text-rosu" : "text-leu"}`}>{money(unallocated)}</span>
          <span className="text-[11px] text-ink-faint">lei</span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 text-[13px]">
        <li title={eur(income / rate)}>
          <Leader label={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-leu" />Venituri</span>} value={lei(income)} />
        </li>
        {shown.map((p) => (
          <li key={p.label} title={eur(p.value / rate)}>
            <Leader
              label={
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
                  {p.auto && hasLoans ? (
                    <Link href="/credite" className="underline decoration-dotted underline-offset-2 hover:text-albastru" title="Calculate automat din credite">
                      {p.label}
                    </Link>
                  ) : (
                    p.label
                  )}
                </span>
              }
              value={lei(p.value)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

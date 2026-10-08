"use client";

import { useEffect, useRef, useState } from "react";
import { BUCKET_LABEL, KIND_LABEL, type Bucket, type Kind } from "@/lib/util";
import { api, CollapsiblePanels, downloadFile, Field, PageHeader, Panel, Toast, TrashIcon, useApi, useApp } from "@/components/ui";
import AccountSecurity from "@/components/AccountSecurity";
import SecurityCenter from "@/components/SecurityCenter";
import NotificationSettings from "@/components/NotificationSettings";
import { ThemeChooser } from "@/components/ThemeToggle";
import DatabaseManager from "@/components/DatabaseManager";

type Category = { id: number; name: string; kind: Kind; bucket: Bucket; color: string };
const PALETTE = ["#3D7A4E", "#5E9A6C", "#2E5C8A", "#4A7BA8", "#27496D", "#6A4E99", "#8A6BB8", "#B5456A", "#C9657F", "#DB8BA4", "#C99A1E", "#8A989C"];

const PARAMS: { key: string; label: string; hint: string; step: number; investmentOnly?: boolean }[] = [
  { key: "emergency_months", label: "Luni în fondul de urgență", hint: "Între 3 și 6 este recomandat; 6+ dacă venitul e variabil", step: 1 },
  { key: "expected_invest_return", label: "Randament anual așteptat (%)", hint: "Folosit la comparația rambursare vs investiție", step: 0.01, investmentOnly: true },
  { key: "invest_tax_pct", label: "Impozit pe câștigul din investiții (%)", hint: "Verifică nivelul actual pentru tipul tău de investiție", step: 0.01, investmentOnly: true },
  { key: "inflation_pct", label: "Inflație estimată (%)", hint: "Pentru valoarea proiecțiilor în bani de azi", step: 0.01 },
];

function CategoryRow({
  c,
  allCats,
  onSaved,
  onDelete,
  onError,
}: {
  c: Category;
  allCats?: Category[];
  onSaved: () => void;
  onDelete: () => void;
  onError?: (msg: string) => void;
}) {
  const [d, setD] = useState(c);
  const dirty = d.name !== c.name || d.bucket !== c.bucket || d.color !== c.color;
  const hasBucket = c.kind !== "income" && c.kind !== "saving";

  const save = async () => {
    const trimmed = d.name.trim();
    if (!trimmed) {
      onError?.("Numele categoriei nu poate fi gol");
      return;
    }
    const duplicate = allCats?.find((other) => other.id !== c.id && other.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      onError?.(`Există deja o categorie cu denumirea „${duplicate.name}”!`);
      return;
    }
    try {
      await api("/api/crud/categories", "PUT", { ...d, name: trimmed });
      onSaved();
    } catch (err: any) {
      onError?.(err?.message || "Eroare la salvarea categoriei");
    }
  };

  return (
    // Un singur rând, și pe telefon: culoare | nume | nevoie/dorință | acțiune. Cât timp rândul are modificări
    // nesalvate, butonul de ștergere devine „Salvează” (✓).
    <li className="flex items-center gap-1.5 py-1.5 sm:gap-2">
      <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="h-9 w-7 shrink-0 cursor-pointer rounded border border-line bg-field p-0.5 sm:w-8" aria-label="Culoare" />
      <input className="field min-w-0 flex-1 !py-1.5" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} aria-label="Nume categorie" />
      {hasBucket && (
        // Comutator compact (în loc de listă): o atingere schimbă între nevoie și dorință.
        <button
          type="button"
          className={`h-9 w-[4.75rem] shrink-0 rounded-md border px-1 font-mono text-[12px] font-semibold uppercase tracking-[0.02em] transition-colors sm:w-24 ${
            d.bucket === "wants" ? "border-rosu/40 bg-rosu-tint text-rosu" : "border-albastru/40 bg-albastru-tint text-albastru"
          }`}
          onClick={() => setD({ ...d, bucket: d.bucket === "wants" ? "needs" : "wants" })}
          aria-label={`${BUCKET_LABEL[d.bucket]} — atinge pentru a schimba`}
          title="Atinge pentru a schimba între nevoie și dorință"
        >
          {d.bucket === "wants" ? "Dorință" : "Nevoie"}
        </button>
      )}
      {dirty ? (
        <button className="btn-primary h-9 w-9 shrink-0 px-0 sm:w-auto sm:px-3" onClick={save} aria-label="Salvează" title="Salvează">
          <span className="sm:hidden" aria-hidden>✓</span>
          <span className="hidden sm:inline">Salvează</span>
        </button>
      ) : (
        <button className="btn-danger h-9 w-9 shrink-0 px-0" onClick={onDelete} aria-label={`Șterge categoria ${c.name}`} title="Șterge">
          <TrashIcon className="h-[17px] w-[17px]" />
        </button>
      )}
    </li>
  );
}


export default function SettingsPage() {
  const {
    bump,
    eurRate,
    fxDate,
    fxError,
    refreshFx,
    inflationRate,
    inflationPeriod,
    inflationSource,
    inflationError,
    refreshInflation,
    confirm,
  } = useApp();
  const { data: cats, reload } = useApi<Category[]>("/api/crud/categories");
  const { data: settings } = useApi<Record<string, string>>("/api/settings");
  const [params, setParams] = useState<Record<string, string>>({});
  const [newCat, setNewCat] = useState({ name: "", kind: "variable" as Kind, bucket: "needs" as Bucket });
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) setParams(settings);
  }, [settings]);

  const changed = (msg: string) => {
    reload();
    bump();
    setToast(msg);
  };

  const addCat = async () => {
    const trimmed = newCat.name.trim();
    if (!trimmed) return;
    const exists = cats?.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setToast(`Categoria „${trimmed}” există deja!`);
      return;
    }
    const bucket = newCat.kind === "saving" ? "savings" : newCat.bucket;
    try {
      await api("/api/crud/categories", "POST", {
        ...newCat,
        name: trimmed,
        bucket,
        color: PALETTE[(cats?.length ?? 0) % PALETTE.length],
      });
      setNewCat({ ...newCat, name: "" });
      changed("Categorie adăugată");
    } catch (e: any) {
      setToast(e?.message || "Eroare la adăugarea categoriei");
    }
  };

  const delCat = async (c: Category) => {
    if (
      !(await confirm({
        title: "Ștergere categorie",
        message: `Sigur dorești să ștergi categoria „${c.name}”? Intrările existente din lunile trecute vor rămâne, dar fără categorie asociată.`,
        confirmText: "Șterge categoria",
        danger: true,
      }))
    )
      return;
    await api(`/api/crud/categories?id=${c.id}`, "DELETE");
    changed("Categorie ștearsă");
  };

  const saveParams = async () => {
    const body = { ...Object.fromEntries(PARAMS.map((p) => [p.key, params[p.key]])), emergency_auto: params.emergency_auto ?? "1" };
    await api("/api/settings", "PUT", body);
    changed("Parametrii au fost salvați");
  };

  const restore = async (file: File) => {
    if (
      !(await confirm({
        title: "Restaurare date din copie de siguranță",
        message:
          "Restaurarea va înlocui TOATE datele actuale din baza de date cu cele din fișierul selectat. Ești sigur că dorești să continui?",
        confirmText: "Restaurare completă",
        danger: true,
      }))
    )
      return;
    try {
      const json = JSON.parse(await file.text());
      await api("/api/backup", "POST", json);
      changed("Datele au fost restaurate");
    } catch (e) {
      setToast((e as Error).message);
    }
  };

  const kinds: Kind[] = ["income", "fixed", "variable", "saving"];

  return (
    <>
      <PageHeader title="Setări" intro="Categoriile, notificările, securitatea și parametrii calculelor." />

      {/* Pe telefon și tabletă, fiecare secțiune e pliată: se vede lista de titluri, iar o secțiune se deschide la atingere. */}
      <CollapsiblePanels>
      <div className="grid gap-4 lg:gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Categorii" summary={cats ? `${cats.length} categorii · nevoi și dorințe` : undefined}>
          <p className="mb-4 text-[13px] text-ink-soft">
            Pentru cheltuieli, atinge „Nevoie” / „Dorință” ca să schimbi tipul. Asta decide cum se calculează metodele de buget.
          </p>
          {cats &&
            kinds.map((k) => (
              <div key={k} className="mb-4">
                <h3 className="mb-0.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-soft">{KIND_LABEL[k]}</h3>
                <ul>
                  {cats.filter((c) => c.kind === k).map((c) => (
                    <CategoryRow
                      key={`${c.id}-${c.name}-${c.bucket}-${c.color}`}
                      c={c}
                      allCats={cats}
                      onSaved={() => changed("Categorie salvată")}
                      onDelete={() => delCat(c)}
                      onError={(msg) => setToast(msg)}
                    />
                  ))}
                </ul>
              </div>
            ))}

          <form className="mt-2 grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap" onSubmit={(e) => { e.preventDefault(); addCat(); }}>
            <div className="col-span-2 min-w-[160px] flex-1">
              <Field label="Categorie nouă">
                <input className="field" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="ex. Animale de companie" />
              </Field>
            </div>
            <select className={`field sm:w-auto ${newCat.kind === "fixed" || newCat.kind === "variable" ? "" : "col-span-2"}`} value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value as Kind })} aria-label="Tip">
              {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            {(newCat.kind === "fixed" || newCat.kind === "variable") && (
              <select className="field sm:w-auto" value={newCat.bucket} onChange={(e) => setNewCat({ ...newCat, bucket: e.target.value as Bucket })} aria-label="Nevoie sau dorință">
                <option value="needs">Nevoi</option>
                <option value="wants">Dorințe</option>
              </select>
            )}
            <button className="btn-primary col-span-2" type="submit">Adaugă categoria</button>
          </form>
        </Panel>

        <div className="flex flex-col gap-4 lg:gap-6">
          <Panel title="Aspect" summary="Temă de zi, de noapte sau automată">
            <p className="mb-3 text-[13px] text-ink-soft">
              Tema de zi sau de noapte. „Auto” o schimbă singură după setarea telefonului sau a calculatorului. Alegerea se
              păstrează pe fiecare dispozitiv; o poți schimba rapid și din butonul ☀️/🌙 din bara aplicației.
            </p>
            <ThemeChooser />
          </Panel>

          <NotificationSettings onToast={(msg) => setToast(msg)} />

          <SecurityCenter onToast={(msg) => setToast(msg)} />

          <AccountSecurity onToast={(msg) => setToast(msg)} />

          <DatabaseManager
            onToast={(msg) => setToast(msg)}
            onRefresh={() => {
              reload();
              bump();
            }}
          />

          <Panel title="Modul Investiții" summary={params.enable_investments === "1" ? "Pornit" : "Oprit"}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${
                      params.enable_investments === "1" ? "bg-leu ring-4 ring-leu/20" : "bg-ink-faint"
                    }`}
                  />
                  <span className="font-semibold text-[15px]">
                    {params.enable_investments === "1" ? "Investiții: Active (pornite)" : "Investiții: Dezactivate (oprite)"}
                  </span>
                </div>
                <p className="mt-1 max-w-sm text-[13px] text-ink-soft">
                  {params.enable_investments === "1"
                    ? "Secțiunea de investiții (ETF-uri, fonduri, titluri de stat) este afișată în aplicație."
                    : "Dezactivat conform preferinței tale (fără investiții în prezent). Activează dacă începi să investești."}
                </p>
              </div>
              <button
                type="button"
                className={params.enable_investments === "1" ? "btn-danger text-[13px]" : "btn-primary text-[13px]"}
                onClick={async () => {
                  const nextVal = params.enable_investments === "1" ? "0" : "1";
                  await api("/api/settings", "PUT", { enable_investments: nextVal });
                  setParams({ ...params, enable_investments: nextVal });
                  changed(nextVal === "1" ? "Modulul de investiții a fost activat" : "Modulul de investiții a fost dezactivat");
                }}
              >
                {params.enable_investments === "1" ? "Oprește investițiile" : "Pornește investițiile"}
              </button>
            </div>
          </Panel>

          <Panel title="Parametri" summary={params.emergency_months ? `Fond de urgență: ${params.emergency_months} luni · inflație ${params.inflation_pct ?? "–"}%` : undefined}>
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveParams(); }}>
              {PARAMS.filter((p) => !p.investmentOnly || params.enable_investments === "1").map((p) => {
                const auto = p.key === "emergency_months" && params.emergency_auto !== "0";
                return (
                  <div key={p.key}>
                    <Field label={p.label} hint={auto ? "Calculat din profilul tău (ocupație, tipul venitului, familie, prudență)." : p.hint}>
                      <input className="field num disabled:opacity-60" type="number" step={p.step} min={0} disabled={auto} value={params[p.key] ?? ""} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })} />
                    </Field>
                    {p.key === "emergency_months" && (
                      <label className="mt-2 flex min-h-[40px] items-center gap-2 text-[13px] text-ink-soft sm:min-h-0">
                        <input type="checkbox" className="h-[18px] w-[18px] sm:h-4 sm:w-4" checked={params.emergency_auto !== "0"} onChange={(e) => setParams({ ...params, emergency_auto: e.target.checked ? "1" : "0" })} />
                        Automat, din <a href="/profil" className="text-albastru hover:underline">profilul meu</a>
                      </label>
                    )}
                  </div>
                );
              })}
              <button className="btn-primary self-start" type="submit">Salvează parametrii</button>
            </form>
          </Panel>

          <Panel title="Curs valutar și inflație" summary={`1 € = ${eurRate.toFixed(4)} lei · inflație ${inflationRate.toFixed(1)}%`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-ink-soft">Curs BNR</span>
              <span className="num text-[16px] font-semibold text-ink">1 € = {eurRate.toFixed(4)} lei</span>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-soft">
              {fxDate ? `Publicat de BNR în ${fxDate.split("-").reverse().join(".")}.` : "Încă nu s-a preluat niciun curs; se folosește 5,00 ca estimare."}{" "}
              Se actualizează automat la cel mult 3 ore; pentru lunile trecute se folosește istoricul BNR.
            </p>
            {fxError && <p className="mt-1 text-[13px] text-rosu">{fxError}</p>}

            <div className="rule-dashed my-4" aria-hidden />

            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-ink-soft">Inflația anuală{inflationPeriod ? ` (${inflationPeriod})` : ""}</span>
              <span className="num text-[16px] font-semibold text-rosu">{inflationRate.toFixed(1)}%</span>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-soft">
              Preluată automat ({inflationSource || "INS / Eurostat IAPC"}); proiecțiile economiilor o folosesc ca să arate valorile viitoare în
              puterea de cumpărare de azi.
            </p>
            {inflationError && <p className="mt-1 text-[13px] text-rosu">{inflationError}</p>}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn-ghost border border-line-strong/70"
                onClick={() => {
                  refreshFx();
                  refreshInflation();
                }}
              >
                ↻ Actualizează
              </button>
              {params.inflation_pct !== String(inflationRate) && (
                <button
                  type="button"
                  className="btn-ghost text-albastru"
                  onClick={() => {
                    setParams({ ...params, inflation_pct: String(inflationRate) });
                    changed(`Parametrul de inflație a fost actualizat la ${inflationRate}%`);
                  }}
                >
                  Folosește {inflationRate}% în calcule
                </button>
              )}
            </div>
          </Panel>

          <Panel title="Copie de siguranță" summary="Export și restaurare (fișier JSON)">
            <p className="mb-3 text-[13px] text-ink-soft">
              Datele stau în baza de date Supabase. Exportă periodic un fișier JSON și păstrează-l pe NAS sau în cloud.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary"
                onClick={() => downloadFile("/api/backup", "buget-backup.json").catch((e) => setToast(e.message))}
              >
                Exportă datele
              </button>
              <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Restaurează din fișier</button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) restore(f);
                  e.target.value = "";
                }}
              />
            </div>
          </Panel>
        </div>
      </div>
      </CollapsiblePanels>
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

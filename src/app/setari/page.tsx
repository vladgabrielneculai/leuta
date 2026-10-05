"use client";

import { useEffect, useRef, useState } from "react";
import { BUCKET_LABEL, KIND_LABEL, type Bucket, type Kind } from "@/lib/util";
import { api, downloadFile, Field, PageHeader, Panel, Toast, TrashIcon, useApi, useApp } from "@/components/ui";
import AccountSecurity from "@/components/AccountSecurity";
import SecurityCenter from "@/components/SecurityCenter";
import NotificationSettings from "@/components/NotificationSettings";
import { ThemeChooser } from "@/components/ThemeToggle";
import DatabaseManager from "@/components/DatabaseManager";

type Category = { id: number; name: string; kind: Kind; bucket: Bucket; color: string };
const PALETTE = ["#3D7A4E", "#5E9A6C", "#2E5C8A", "#4A7BA8", "#27496D", "#6A4E99", "#8A6BB8", "#B5456A", "#C9657F", "#DB8BA4", "#C99A1E", "#8A989C"];

const PARAMS: { key: string; label: string; hint: string; step: number; investmentOnly?: boolean }[] = [
  { key: "emergency_months", label: "Luni în fondul de urgență", hint: "Între 3 și 6 este recomandat; 6+ dacă venitul e variabil", step: 1 },
  { key: "expected_invest_return", label: "Randament anual așteptat (%)", hint: "Folosit la comparația rambursare vs investiție", step: 0.5, investmentOnly: true },
  { key: "invest_tax_pct", label: "Impozit pe câștigul din investiții (%)", hint: "Verifică nivelul actual pentru tipul tău de investiție", step: 1, investmentOnly: true },
  { key: "inflation_pct", label: "Inflație estimată (%)", hint: "Pentru valoarea proiecțiilor în bani de azi", step: 0.5 },
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
  return (
    // Telefon: culoare | nume | ștergere pe primul rând, apoi „Nevoi/Dorințe” și „Salvează” (doar după o modificare).
    // Ecran mare: totul pe un rând.
    <li className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 py-2 sm:flex sm:flex-wrap">
      <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="h-10 w-10 cursor-pointer rounded-lg border border-line bg-field p-1 sm:h-8 sm:w-8 sm:rounded sm:p-0.5" aria-label="Culoare" />
      <input className="field sm:min-w-[160px] sm:flex-1" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} aria-label="Nume categorie" />
      {c.kind !== "income" && c.kind !== "saving" && (
        <select className="field order-1 col-start-2 sm:order-none sm:w-auto" value={d.bucket} onChange={(e) => setD({ ...d, bucket: e.target.value as Bucket })} aria-label="Tip pentru buget">
          <option value="needs">{BUCKET_LABEL.needs}</option>
          <option value="wants">{BUCKET_LABEL.wants}</option>
        </select>
      )}
      <button
        className={`btn-primary order-1 col-start-3 sm:order-none ${dirty ? "" : "hidden sm:inline-flex"}`}
        disabled={!dirty}
        onClick={async () => {
          const trimmed = d.name.trim();
          if (!trimmed) {
            onError?.("Numele categoriei nu poate fi gol");
            return;
          }
          const duplicate = allCats?.find(
            (other) => other.id !== c.id && other.name.trim().toLowerCase() === trimmed.toLowerCase()
          );
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
        }}
      >
        Salvează
      </button>
      <button className="btn-danger h-10 w-10 px-0 sm:h-auto sm:w-auto sm:px-3.5" onClick={onDelete} aria-label="Șterge" title="Șterge">
        <TrashIcon className="h-[18px] w-[18px] sm:hidden" />
        <span className="hidden sm:inline">Șterge</span>
      </button>
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
    const body = Object.fromEntries(PARAMS.map((p) => [p.key, params[p.key]]));
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
      <PageHeader title="Setări" intro="Categoriile, parametrii calculelor și copiile de siguranță." />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Categorii">
          <p className="mb-4 text-[13px] text-ink-soft">
            Pentru cheltuieli, alege dacă sunt nevoi sau dorințe. Asta decide cum se calculează metodele de buget.
          </p>
          {cats &&
            kinds.map((k) => (
              <div key={k} className="mb-5">
                <h3 className="mb-1 text-[15px] font-semibold">{KIND_LABEL[k]}</h3>
                <ul className="divide-y divide-line border-y border-line">
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

        <div className="flex flex-col gap-6">
          <Panel title="Aspect">
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

          <Panel title="Modul Investiții">
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

          <Panel title="Parametri">
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); saveParams(); }}>
              {PARAMS.filter((p) => !p.investmentOnly || params.enable_investments === "1").map((p) => (
                <Field key={p.key} label={p.label} hint={p.hint}>
                  <input className="field num" type="number" step={p.step} min={0} value={params[p.key] ?? ""} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })} />
                </Field>
              ))}
              <button className="btn-primary self-start" type="submit">Salvează parametrii</button>
            </form>
          </Panel>

          <Panel title="Curs valutar">
            <p className="num text-[15px] font-semibold text-ink">1 € = {eurRate.toFixed(4)} lei</p>
            <p className="text-[13px] text-ink-soft mt-1">
              {fxDate ? `Publicat de BNR în ${fxDate.split("-").reverse().join(".")}.` : "Încă nu s-a preluat niciun curs; se folosește 5,00 ca estimare."}{" "}
              Se actualizează automat la cel mult 3 ore. Pentru lunile trecute se descarcă istoricul anual BNR.
            </p>
            {fxError && <p className="mt-2 text-[13px] text-rosu">{fxError}</p>}
            <button className="btn-ghost mt-2 -ml-3" onClick={refreshFx}>Verifică curs BNR</button>
          </Panel>

          <Panel title="Rata inflației (România)">
            <div className="flex items-baseline justify-between">
              <span className="num font-display text-[22px] font-bold text-rosu">{inflationRate.toFixed(1)}%</span>
              <span className="rounded-full bg-leu-tint/60 px-2.5 py-0.5 text-[11px] font-medium text-leu">
                {inflationPeriod ? `Perioada: ${inflationPeriod}` : "Date oficiale"}
              </span>
            </div>
            <p className="text-[13px] text-ink-soft mt-1.5">
              Rata anuală a inflației din România preluată automat de pe internet ({inflationSource || "INS / Eurostat IAPC"}).
              Se reflectă în proiecțiile economiilor pentru a converti valorile viitoare în puterea de cumpărare de azi.
            </p>
            {inflationError && <p className="mt-2 text-[13px] text-rosu">{inflationError}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost -ml-2" onClick={refreshInflation}>
                Actualizează de pe internet
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
                  Sincronizează parametrul ({inflationRate}%)
                </button>
              )}
            </div>
          </Panel>

          <Panel title="Copie de siguranță">
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
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

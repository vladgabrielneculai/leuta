"use client";

import Link from "next/link";
import { useState } from "react";
import { monthLabel } from "@/lib/util";
import { longDate } from "@/lib/notify/time";
import { currentBudgetMonth, nextPayday, rangeLabel, WEEKEND_RULES, type PayCycle, type WeekendRule } from "@/lib/payCycle";
import { api, Panel, Toast, useApi, useApp } from "./ui";

type CycleView = { cycle: PayCycle; active: boolean; pending: number; months: string[]; moved?: number };

const entriesText = (n: number) => (n === 1 ? "o intrare" : `${n} intrări`);
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Setări → Calcule → „Luna de buget”: luna calendaristică sau de la salariu la salariu.
 * La pornire, oprire sau schimbarea regulii, intrările existente se pot muta în luna potrivită (cu confirmare).
 */
export default function PayCycleSettings() {
  const { confirm, reloadCycle, setMonth, bump } = useApp();
  const { data, reload } = useApi<CycleView>("/api/pay-cycle");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = async () => {
    const c = await reloadCycle();
    if (c) setMonth(currentBudgetMonth(c));
    bump();
    reload();
  };

  /** Propune mutarea intrărilor existente; „Nu acum” le lasă pe loc (se pot muta mai târziu, din panou). */
  const offerResort = async (v: CycleView) => {
    if (!v.pending) return;
    const span = v.months.length ? ` (${v.months.map((m) => monthLabel(m)).join(", ")})` : "";
    const ok = await confirm({
      title: "Mut și intrările existente?",
      message: v.active
        ? `${capital(entriesText(v.pending))} cu data dinaintea salariului trec în luna salariului din care s-au plătit${span}. Intrările marcate „lunar” rămân în luna lor. Poți reveni oricând, oprind opțiunea.`
        : `${capital(entriesText(v.pending))} revin în luna calendaristică a datei lor${span}.`,
      confirmText: `Mută ${entriesText(v.pending)}`,
      cancelText: "Nu acum",
    });
    if (!ok) return;
    const r = await api<CycleView>("/api/pay-cycle", "PUT", { resort: true });
    setToast(`Am mutat ${entriesText(r.moved ?? 0)}`);
    await refresh();
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = (body: { enabled?: boolean; weekend?: WeekendRule }) =>
    run(async () => {
      const v = await api<CycleView>("/api/pay-cycle", "PUT", body);
      await refresh();
      setToast(body.enabled === undefined ? "Regula pentru weekend a fost salvată" : v.active ? "Luna începe acum la salariu" : "Luna e din nou cea calendaristică");
      await offerResort(v);
    });

  const c = data?.cycle;
  const now = c ? currentBudgetMonth(c) : null;

  return (
    <Panel title="Luna de buget" summary={data && c && now ? (data.active ? `De la salariu la salariu · ${rangeLabel(now, c)}` : "Luna calendaristică (1–31)") : undefined}>
      <p className="mb-3 text-[13px] text-ink-soft">
        Dacă salariul vine după începutul lunii, cheltuielile de dinaintea lui se plătesc încă din salariul trecut. Cu luna de la
        salariu, „noiembrie” ține de la salariul din noiembrie până în ziua dinaintea salariului din decembrie, iar ce cheltuiești
        înainte de salariu intră în luna dinainte.
      </p>

      {!data || !c ? null : c.payday === null ? (
        <p className="text-[13px]">
          Completează întâi <strong>ziua salariului</strong> în{" "}
          <Link href="/profil" className="font-semibold text-albastru hover:underline">
            Profil
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[13.5px]">
              <div className="font-semibold">{data.active ? "Pornită" : "Oprită"}</div>
              <div className="text-ink-soft">
                Salariul pe {c.payday} ale lunii · următorul: {longDate(nextPayday(c.payday, c.weekend))}
              </div>
              {data.active && now && (
                <div className="text-ink-soft">
                  Luna curentă: <span className="capitalize">{monthLabel(now)}</span> ({rangeLabel(now, c)})
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              className={data.active ? "btn-ghost text-[13px]" : "btn-primary text-[13px]"}
              onClick={() => save({ enabled: !data.active })}
            >
              {data.active ? "Revino la luna calendaristică" : "Începe luna la salariu"}
            </button>
          </div>

          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-ink-soft">Când ziua salariului pică în weekend, salariul vine:</span>
            <select className="field" disabled={busy} value={c.weekend} onChange={(e) => save({ weekend: e.target.value as WeekendRule })}>
              {WEEKEND_RULES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          {data.pending > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-line bg-sheet p-3 text-[13px]">
              <span>
                {capital(entriesText(data.pending))} nu {data.pending === 1 ? "e" : "sunt"} încă în luna potrivită.
              </span>
              <button type="button" className="btn-primary text-[13px]" disabled={busy} onClick={() => run(() => offerResort(data))}>
                Mută acum
              </button>
            </div>
          )}

          <p className="text-[12px] text-ink-faint">
            Intrările marcate „lunar” (chiria, abonamentele copiate lună de lună), cele din programări și ratele creditelor rămân în
            luna pentru care sunt. Sărbătorile legale nu mută ziua salariului; dacă îl primești în altă zi, schimbă data intrării.
          </p>
        </div>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </Panel>
  );
}

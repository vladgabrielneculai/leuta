"use client";

import { useState } from "react";
import type { Forecast } from "@/lib/forecast";
import { lei } from "@/lib/util";
import { Panel, useApi } from "./ui";

type Response = Forecast & { month: string; upcoming: { name: string; amount: number; kind: "income" | "expense"; date: string }[] };

const fmtDay = (d: string) => d.slice(8, 10) + "." + d.slice(5, 7);

/**
 * Estimarea la sfârșitul lunii curente (beta), în Luna curentă: cât rămâne, din ce mai vine și din ritmul
 * obișnuit al cheltuielilor. `version` reîncarcă estimarea după fiecare intrare (prin useApi).
 */
export default function ForecastCard() {
  const { data } = useApi<Response>("/api/forecast");
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const minus = data.endBalance < 0;
  return (
    <Panel title="Estimare la final de lună" summary={`rămân ~${lei(data.endBalance)}`}>
      <p className={`num text-[26px] font-semibold ${minus ? "text-rosu" : "text-leu"}`}>{lei(data.endBalance)}</p>
      <p className="text-[13px] text-ink-soft">
        {minus ? "Așa cum merge, luna se termină pe minus." : "Ar trebui să-ți rămână atât pe ultima zi a lunii."}
        {data.daysLeft > 0 && (
          <> Mai sunt {data.daysLeft} zile; poți cheltui cam <strong className="text-ink">{lei(Math.max(0, data.safeDaily))}</strong> pe zi ca să nu intri pe minus.</>
        )}
      </p>
      <button type="button" className="mt-2 text-[13px] text-albastru underline" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Ascunde calculul" : "Cum am calculat"}
      </button>
      {open && (
        <dl className="num mt-2 flex flex-col gap-1 text-[13px]">
          <div className="flex justify-between"><dt className="text-ink-soft">Venituri (cu cele programate)</dt><dd>{lei(data.incomeExpected)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Plăți programate care mai vin</dt><dd>{lei(data.upcomingExpense)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Cheltuieli variabile care mai vin (până la media ta)</dt><dd>{lei(data.variableLeft)}</dd></div>
          <div className="flex justify-between font-medium"><dt>Toate cheltuielile lunii, estimat</dt><dd>{lei(data.spentExpected)}</dd></div>
          {data.upcoming.length > 0 && (
            <ul className="mt-1 text-[12.5px] text-ink-soft">
              {data.upcoming.map((u, i) => (
                <li key={i} className="flex justify-between">
                  <span>{fmtDay(u.date)} · {u.name}</span>
                  <span className={u.kind === "income" ? "text-leu" : ""}>{u.kind === "income" ? "+" : "−"}{lei(u.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </dl>
      )}
    </Panel>
  );
}

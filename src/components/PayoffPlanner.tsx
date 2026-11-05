"use client";

import { useMemo, useState } from "react";
import { addMonths, lei, monthLabel, parseAmount, pct } from "@/lib/util";
import { compareStrategies, type Debt, type PayoffResult } from "@/lib/payoff";
import { Panel } from "./ui";

const LABEL: Record<PayoffResult["strategy"], { name: string; help: string }> = {
  minimum: { name: "Doar ratele", help: "fără bani în plus" },
  snowball: { name: "Bulgărele de zăpadă", help: "întâi cea mai mică datorie" },
  avalanche: { name: "Avalanșa", help: "întâi dobânda cea mai mare" },
};

const duration = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} ${y === 1 ? "an" : "ani"}` : "", m ? `${m} ${m === 1 ? "lună" : "luni"}` : ""].filter(Boolean).join(" și ") || "–";
};

/**
 * Strategia de rambursare: cu o sumă în plus pe lună, în ce ordine închizi datoriile și cât economisești.
 * `month` = luna selectată; luna 1 a simulării este luna următoare.
 */
export default function PayoffPlanner({ debts, month }: { debts: Debt[]; month: string }) {
  const [raw, setRaw] = useState("500");
  const extra = Math.max(0, parseAmount(raw) || 0);
  const r = useMemo(() => compareStrategies(debts, extra), [debts, extra]);
  const best = r.avalanche.totalInterest <= r.snowball.totalInterest ? r.avalanche : r.snowball;
  const savedVsMin = r.minimum.totalInterest - best.totalInterest;
  const sameOrder = r.snowball.order.map((o) => o.id).join() === r.avalanche.order.map((o) => o.id).join();
  const at = (n: number) => monthLabel(addMonths(month, n));

  return (
    <Panel className="mt-6" title="Strategia de rambursare">
      <p className="mb-4 text-[14px] text-ink-soft">
        Cât poți pune lunar în plus peste rate? Suma merge la o datorie; când se închide, rata ei trece la următoarea.
      </p>
      <label className="mb-5 flex max-w-xs items-center gap-3">
        <span className="label mb-0! shrink-0">În plus pe lună</span>
        <input className="field num min-w-0 flex-1" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Suma în plus pe lună (lei)" />
        <span className="text-[14px] text-ink-soft">lei</span>
      </label>

      <div className="overflow-x-auto">
        <table className="num w-full min-w-[520px] text-[14px]">
          <thead className="text-left text-[13px] text-ink-soft">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Variantă</th>
              <th className="py-2 pr-3 text-right font-medium">Fără datorii în</th>
              <th className="py-2 pr-3 text-right font-medium">Dobândă totală</th>
              <th className="py-2 text-right font-medium">Economisești</th>
            </tr>
          </thead>
          <tbody>
            {[r.minimum, r.snowball, r.avalanche].map((x) => (
              <tr key={x.strategy} className={`border-b border-line/60 ${x === best && extra > 0 ? "font-semibold" : ""}`}>
                <td className="py-2 pr-3">
                  {LABEL[x.strategy].name}
                  <span className="block text-[12px] font-normal text-ink-soft">{LABEL[x.strategy].help}</span>
                </td>
                <td className="py-2 pr-3 text-right">
                  {x.stuck ? <span className="text-rosu">nu se închide</span> : <>{duration(x.months)}<span className="block text-[12px] font-normal text-ink-soft">{at(x.months)}</span></>}
                </td>
                <td className="py-2 pr-3 text-right">{lei(x.totalInterest)}</td>
                <td className="py-2 text-right text-leu">{x.strategy === "minimum" ? "–" : lei(r.minimum.totalInterest - x.totalInterest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {extra > 0 && best.order.length > 0 && (
        <div className="mt-4 text-[14px]">
          <p className="font-medium">
            Ordinea recomandată ({LABEL[best.strategy].name.toLowerCase()}){sameOrder && debts.length > 1 ? ", la fel la ambele metode" : ""}:
          </p>
          <ol className="mt-1 list-decimal pl-5 text-ink-soft">
            {best.order.map((o) => {
              const d = debts.find((x) => x.id === o.id);
              return (
                <li key={o.id}>
                  <span className="text-ink">{o.name}</span> ({d ? `${lei(d.balance)}, ${pct(d.rate, 2)}` : ""}) · închis în {at(o.month)}
                </li>
              );
            })}
          </ol>
          {savedVsMin > 0 && <p className="mt-2 text-leu">Economisești {lei(savedVsMin)} dobândă față de plata doar a ratelor.</p>}
        </div>
      )}
      <p className="mt-4 text-[12.5px] text-ink-faint">
        Estimare la dobânda de azi, fără comisioane de rambursare anticipată, asigurări sau schimbarea dobânzii variabile.
        Pentru calculul exact al unui credit, folosește simulatorul din pagina lui.
      </p>
    </Panel>
  );
}

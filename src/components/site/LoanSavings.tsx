"use client";

import { useMemo, useRef, useState } from "react";
import { amortize, money } from "@/lib/site/format";
import { ease, range, useScrollEffect } from "@/lib/site/scroll";
import Reveal from "./Reveal";

/**
 * Două bonuri care se „completează” la derulare:
 * 1) creditul: soldul în timp, cu și fără plăți anticipate (graficul se desenează, economia urcă);
 * 2) fondul de urgență: lunile acoperite se umplu una câte una.
 */
const LOAN = { principal: 320000, rate: 0.0585, months: 360, extra: 500 };

export default function LoanSavings() {
  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-20 sm:px-6 md:grid-cols-[1.25fr_1fr] md:py-32">
      <LoanCard />
      <SavingsCard />
    </section>
  );
}

function LoanCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  useScrollEffect(ref, "through", (v) => setP(Math.round(v * 500) / 500));
  const draw = ease(range(p, 0.15, 0.55));

  const { base, fast, path } = useMemo(() => {
    const base = amortize(LOAN.principal, LOAN.rate, LOAN.months);
    const fast = amortize(LOAN.principal, LOAN.rate, LOAN.months, LOAN.extra);
    const W = 600, H = 220;
    const path = (b: number[]) =>
      b.map((v, i) => `${i === 0 ? "M" : "L"}${((i / LOAN.months) * W).toFixed(1)},${(H - (v / LOAN.principal) * H).toFixed(1)}`).join(" ");
    return { base, fast, path };
  }, []);

  const saved = base.interest - fast.interest;
  const yearsSaved = (base.months - fast.months) / 12;

  return (
    <div ref={ref} className="panel px-5 pb-6 pt-6 sm:px-8 sm:pt-8">
      <p className="receipt-title">Credit ipotecar · plată anticipată</p>
      <div className="rule-dashed my-4" />
      <p className="text-[14px] text-ink-soft">
        {money(LOAN.principal, 0)} lei pe 30 de ani, dobândă {money(LOAN.rate * 100)}%. Ce se întâmplă dacă plătești în plus{" "}
        <b className="text-ink">{LOAN.extra} lei</b> pe lună?
      </p>

      <svg viewBox="0 0 600 240" className="mt-6 w-full overflow-visible" role="img" aria-label="Soldul creditului în timp, cu și fără plăți anticipate">
        {[0, 0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2="600" y1={g * 220} y2={g * 220} stroke="rgb(var(--line))" strokeDasharray="3 5" />
        ))}
        <line x1="0" x2="600" y1="220" y2="220" stroke="rgb(var(--line-strong))" />
        <path d={path(base.balances)} fill="none" stroke="var(--c-mov)" strokeWidth="3" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} />
        <path d={path(fast.balances)} fill="none" stroke="var(--c-leu)" strokeWidth="3.5" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} />
        {[0, 10, 20, 30].map((y) => (
          <text key={y} x={(y / 30) * 600} y="238" fontSize="12" fill="rgb(var(--ink-faint))" textAnchor={y === 0 ? "start" : y === 30 ? "end" : "middle"}>
            {y === 0 ? "azi" : `${y} ani`}
          </text>
        ))}
        <circle cx={(fast.months / LOAN.months) * 600} cy="220" r="6" fill="var(--c-leu)" opacity={range(p, 0.5, 0.56)} />
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-soft">
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-5 rounded" style={{ background: "var(--c-mov)" }} /> rate normale
        </span>
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-5 rounded" style={{ background: "var(--c-leu)" }} /> + {LOAN.extra} lei/lună
        </span>
      </div>

      <div className="rule-double my-5" />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[12.5px] text-ink-faint">Dobândă economisită</p>
          <p className="num mt-1 text-[24px] font-bold text-leu sm:text-[30px]">
            {money(saved * draw, 0)} <span className="text-[14px] font-medium">lei</span>
          </p>
        </div>
        <div>
          <p className="text-[12.5px] text-ink-faint">Termină mai devreme cu</p>
          <p className="num mt-1 text-[24px] font-bold sm:text-[30px]">
            {(yearsSaved * draw).toLocaleString("ro-RO", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} <span className="text-[14px] font-medium">ani</span>
          </p>
        </div>
      </div>
      <p className="mt-4 text-[12px] text-ink-faint">Calcul ilustrativ, cu rate egale și dobândă fixă. În aplicație îl faci pe creditele tale.</p>
    </div>
  );
}

function SavingsCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  useScrollEffect(ref, "through", (v) => setP(Math.round(v * 500) / 500));
  const months = 6;
  const filled = 3 * ease(range(p, 0.18, 0.5));
  const goal = ease(range(p, 0.3, 0.62));

  return (
    <div ref={ref} className="flex flex-col gap-8">
      <div className="panel px-5 pb-6 pt-6 sm:px-8 sm:pt-8">
        <p className="receipt-title">Fondul de urgență</p>
        <div className="rule-dashed my-4" />
        <div className="flex items-end justify-between gap-3">
          <p>
            <span className="num text-[44px] font-bold leading-none">{Math.floor(filled + 0.001)}</span>
            <span className="ml-2 text-[15px] text-ink-soft">din {months} luni</span>
          </p>
          <p className="num text-right text-[15px] font-semibold text-galben">
            {money(20000 * (filled / 3), 0)} lei
            <span className="block text-[12px] font-normal text-ink-faint">din 36.000 lei</span>
          </p>
        </div>
        <div className="mt-5 grid grid-cols-6 gap-1.5" aria-hidden>
          {Array.from({ length: months }, (_, i) => {
            const f = Math.max(0, Math.min(1, filled - i));
            return (
              <span key={i} className="relative h-9 overflow-hidden rounded-[3px] border border-line-strong/70 bg-paper">
                <span className="absolute inset-y-0 left-0" style={{ width: `${f * 100}%`, background: "var(--c-galben)" }} />
              </span>
            );
          })}
        </div>
        <p className="mt-3 text-[12.5px] text-ink-faint">O lună de nevoi esențiale te costă în medie 6.000 lei. Ținta: 6 luni.</p>
      </div>

      <Reveal className="panel px-5 pb-6 pt-6 sm:px-8 sm:pt-8">
        <div className="flex items-baseline justify-between">
          <p className="font-semibold">
            <span className="mr-2 inline-block h-3 w-1 rounded bg-galben align-middle" />
            Vacanță de vară
          </p>
          <span className="text-[12.5px] text-ink-faint">termen: martie 2027</span>
        </div>
        <p className="num mt-3 text-[26px] font-bold">
          {money(5600 * goal, 0)} <span className="text-[13px] font-normal text-ink-faint">din 9.000 lei</span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
          <span className="block h-full rounded-full bg-galben" style={{ width: `${(5600 / 9000) * 100 * goal}%` }} />
        </div>
        <p className="mt-3 text-[13px] text-ink-soft">
          Necesar lunar: <b className="num text-ink">680 lei</b> · Atingere estimată: <b className="text-ink">aprilie 2027</b>
        </p>
      </Reveal>
    </div>
  );
}

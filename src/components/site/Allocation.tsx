"use client";

import { useRef, useState } from "react";
import { money } from "@/lib/site/format";
import { ease, range, useScrollEffect } from "@/lib/site/scroll";

/** Împărțirea venitului, ca pe Panoul din aplicație (contul demonstrativ, octombrie 2026). */
const INCOME = 10080;
const PARTS = [
  { label: "Costuri fixe", value: 300, color: "var(--c-albastru)" },
  { label: "Rate credite", value: 2760.72, color: "var(--c-mov)" },
  { label: "Cheltuieli variabile", value: 4900, color: "var(--c-rosu)" },
  { label: "Economii și rambursări", value: 1600, color: "var(--c-galben)" },
  { label: "Nealocat", value: 519.28, color: "var(--c-leu)", striped: true },
];

/**
 * Secțiune „lipită” de ecran: pe măsură ce derulezi, venitul lunii se împarte pe rând în cele cinci
 * benzi colorate, iar sumele urcă de la zero, exact ca pe Panou.
 */
export default function Allocation() {
  const ref = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  useScrollEffect(ref, "sticky", (v) => setP(Math.round(v * 400) / 400));

  const fill = (i: number) => ease(range(p, 0.08 + i * 0.13, 0.2 + i * 0.13));
  const outro = ease(range(p, 0.78, 0.9));
  const saved = Math.round((1600 / INCOME) * 100);

  return (
    <section ref={ref} className="relative h-[260vh]" aria-label="Unde merg banii">
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden pt-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="kicker">Panou · Octombrie 2026</p>
          <h2 className="mt-3 max-w-3xl text-[28px] font-bold leading-[1.08] sm:mt-4 sm:text-[48px]">Fiecare leu primește un loc.</h2>
          <p className="mt-4 hidden max-w-2xl text-[15.5px] text-ink-soft sm:block sm:text-[17px]">
            Venitul lunii se împarte automat pe costuri fixe, rate, cheltuieli și economii. Ce rămâne nealocat vezi pe loc.
          </p>

          <div className="mt-6 flex items-baseline gap-3 sm:mt-10">
            <span className="text-[13px] text-ink-faint">Venit</span>
            <span className="num text-[36px] font-bold leading-none sm:text-[64px]">{money(INCOME * ease(range(p, 0, 0.1)))}</span>
            <span className="text-[18px] text-ink-soft sm:text-[24px]">lei</span>
          </div>

          <div className="mt-5 flex h-12 gap-[3px] sm:mt-6 overflow-hidden rounded-md bg-line/60 sm:h-20" aria-hidden>
            {PARTS.map((part, i) => (
              <span
                key={part.label}
                className={part.striped ? "striped" : ""}
                style={{
                  width: `${(part.value / INCOME) * 100 * fill(i)}%`,
                  background: part.striped ? undefined : part.color,
                  transition: "width 60ms linear",
                }}
              />
            ))}
          </div>

          <ul className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 sm:mt-6 sm:grid-cols-5 sm:gap-y-4">
            {PARTS.map((part, i) => (
              <li key={part.label} style={{ opacity: 0.25 + 0.75 * fill(i) }}>
                <span className="flex items-center gap-2 text-[12.5px] leading-tight text-ink-soft sm:text-[13.5px]">
                  <span className={`h-3 w-3 shrink-0 rounded-[3px] ${part.striped ? "striped" : ""}`} style={{ background: part.striped ? undefined : part.color }} />
                  {part.label}
                </span>
                <span className="num mt-1 block text-[14.5px] font-semibold sm:text-[17px]">
                  {money(part.value * fill(i))} <span className="text-[12px] font-normal text-ink-faint">lei</span>
                </span>
                <span className="hidden text-[12.5px] text-ink-faint sm:inline">{Math.round((part.value / INCOME) * 100 * fill(i))}%</span>
              </li>
            ))}
          </ul>

          <p className="mt-6 max-w-3xl text-[16.5px] leading-snug sm:mt-10 sm:text-[24px]" style={{ opacity: outro, transform: `translateY(${(1 - outro) * 16}px)` }}>
            Din fiecare 100 lei câștigați, <b className="text-galben">{saved} lei</b> au mers spre viitorul tău și <b className="text-leu">5 lei</b> încă așteaptă o
            destinație.
          </p>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useRef } from "react";
import { SITE } from "@/lib/site/config";
import { money } from "@/lib/site/format";
import { useScrollEffect } from "@/lib/site/scroll";
import Barcode from "./Barcode";

/** Rândurile bonului lunii, cu aceleași cifre ca în contul demonstrativ din aplicație. */
const LINES: { label: string; value: number; color: string; sign?: string }[] = [
  { label: "Costuri fixe", value: 300, color: "var(--c-albastru)", sign: "−" },
  { label: "Rate credite", value: 2760.72, color: "var(--c-mov)", sign: "−" },
  { label: "Cheltuieli variabile", value: 4900, color: "var(--c-rosu)", sign: "−" },
  { label: "Economii", value: 1600, color: "var(--c-galben)", sign: "−" },
];

export default function Hero() {
  const section = useRef<HTMLElement>(null);
  const receipt = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);

  // La derulare bonul urcă mai încet decât pagina și se înclină ușor, iar textul se estompează.
  useScrollEffect(section, "through", (p) => {
    const t = Math.max(0, p - 0.5) * 2; // 0 cât timp secțiunea e încă sus, apoi 0 → 1
    if (receipt.current) receipt.current.style.transform = `translateY(${t * -60}px) rotate(${-1.5 + t * -3}deg)`;
    if (copy.current) copy.current.style.opacity = String(1 - t * 0.9);
  });

  return (
    <section ref={section} className="relative overflow-hidden pt-24 sm:pt-28">
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 pb-16 sm:px-6 md:grid-cols-[1.3fr_0.7fr] lg:grid-cols-[1.4fr_0.8fr] md:gap-8 md:pb-24 lg:pt-6">
        <div ref={copy} className="md:pt-14">
          <p className="kicker rise">Bon nr. 0001 · Bugetul personal</p>
          <h1 className="rise mt-5 text-[42px] font-bold leading-[1.03] sm:text-[56px] lg:text-[66px]" style={{ animationDelay: "80ms" }}>
            Bugetul tău, clar ca un bon.
          </h1>
          <p className="rise mt-6 max-w-[34rem] text-[16px] leading-relaxed text-ink-soft sm:text-[17px]" style={{ animationDelay: "160ms" }}>
            Leuța îți arată în fiecare lună unde au mers banii: venituri, cheltuieli, rate și economii, pe telefon și pe calculator. Fără foi de calcul și
            fără acces la contul tău bancar.
          </p>
          <div className="rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}>
            <a href="#invitatie" className="btn-primary">
              Cere o invitație <span aria-hidden>›</span>
            </a>
            <a href="#functii" className="btn-ghost">
              Vezi cum funcționează
            </a>
          </div>
          <p className="rise mt-5 text-[13px] text-ink-faint" style={{ animationDelay: "320ms" }}>
            Gratuit · Acces pe bază de invitație · Ai deja cont?{" "}
            <a href={`${SITE.appUrl}/login`} className="text-ink-soft underline underline-offset-2 hover:text-ink">
              Intră aici
            </a>
          </p>
        </div>

        {/* Casa de marcat: fanta și bonul care iese din ea. */}
        <div className="relative mx-auto w-full max-w-[380px] md:mt-2">
          <div className="printer-slot relative z-10 mx-[-14px]" aria-hidden />
          <div className="relative -mt-[9px] overflow-hidden px-1 pb-8">
            <div ref={receipt} style={{ transformOrigin: "50% 0" }}>
              <div className="printing">
                <div className="panel !mt-0 px-6 pb-6 pt-7 text-[13.5px]">
                  <div className="text-center">
                    <p className="text-[17px] font-bold tracking-tight">LEUȚA</p>
                    <p className="mt-0.5 text-[11.5px] uppercase tracking-[0.14em] text-ink-faint">Bonul lunii · octombrie 2026</p>
                  </div>
                  <div className="rule-dashed my-4" />
                  <Row label="Venit" value={10080} strong color="var(--c-leu)" />
                  <div className="mt-2 space-y-1.5">
                    {LINES.map((l) => (
                      <Row key={l.label} {...l} />
                    ))}
                  </div>
                  <div className="rule-double my-4" />
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">REST NEALOCAT</span>
                    <span className="num text-[22px] font-bold text-leu">
                      {money(519.28)} <span className="text-[13px] font-medium">lei</span>
                    </span>
                  </div>
                  <div className="mt-4 flex h-2.5 overflow-hidden rounded-[3px]" aria-hidden>
                    <span style={{ width: "3%", background: "var(--c-albastru)" }} />
                    <span style={{ width: "27%", background: "var(--c-mov)" }} />
                    <span style={{ width: "49%", background: "var(--c-rosu)" }} />
                    <span style={{ width: "16%", background: "var(--c-galben)" }} />
                    <span className="striped" style={{ width: "5%" }} />
                  </div>
                  <div className="rule-dashed my-4" />
                  <p className="text-center text-[11.5px] uppercase tracking-[0.2em] text-ink-faint">*** Vă mulțumim! ***</p>
                  <Barcode value="leuta-2026-10" className="mx-auto mt-3 h-9 w-48 text-ink" />
                  <p className="mt-1 text-center text-[10.5px] tracking-[0.3em] text-ink-faint">100 2026 1007</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, color, sign, strong }: { label: string; value: number; color: string; sign?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-[2px]" style={{ background: color }} aria-hidden />
      <span className={strong ? "font-semibold" : "text-ink-soft"}>{label}</span>
      <span className="leader-dots min-w-[1rem] flex-1" aria-hidden />
      <span className={`num ${strong ? "font-bold" : ""}`}>
        {sign ? `${sign} ` : ""}
        {money(value)}
      </span>
    </div>
  );
}

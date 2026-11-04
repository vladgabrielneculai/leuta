"use client";

import { useEffect, useId, useState } from "react";
import { LogoArt } from "./Logo";
import { rosette } from "@/lib/rosette";

const BANDS = ["var(--c-leu)", "var(--c-mov)", "var(--c-rosu)", "var(--c-galben)", "var(--c-albastru)"];
// Rozetele mari din fundal, desenate „cu peniță” la început (calculate o singură dată).
const RINGS = [
  rosette(200, 200, 190, { lobes: 60, turns: 17, depth: 0.22, step: 0.02 }),
  rosette(200, 200, 150, { lobes: 44, turns: 13, depth: 0.3, step: 0.02 }),
  rosette(200, 200, 112, { lobes: 30, turns: 7, depth: 0.4, step: 0.02 }),
];
const WORD = "Leuța";
// Momentul în care animația începe să se estompeze, apoi dispare cu totul (ms).
const EXIT_AT = 2500;
const GONE_AT = 2950;

// Animația rulează la fiecare încărcare (sau reîmprospătare) a paginii. Momentul pornirii se reține
// la nivel de modul, deci o singură dată per încărcare: în dezvoltare React montează componentele de
// două ori, iar fără asta animația ar porni de la capăt a doua oară.
// null = nedecis, -1 = nu rulează (mișcare redusă), altfel = momentul pornirii.
let startedAt: number | null = null;

function decide(): number {
  if (startedAt !== null) return startedAt;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  startedAt = reduced ? -1 : performance.now();
  return startedAt;
}

/**
 * Animația de început de pe ecranul de autentificare, ca tiparul unei bancnote: rozetele de ghioș se
 * desenează din peniță, sigla apare în mijlocul lor, numele se așază literă cu literă, iar dedesubt
 * se trag, una după alta, benzile în culorile bancnotelor (1, 5, 10, 50, 100 lei). Durează ~2,5 s,
 * se poate sări cu o atingere și nu rulează deloc dacă sistemul cere mișcare redusă.
 */
export default function IntroSplash() {
  // Pornește vizibilă, ca formularul să nu apară o clipă înaintea ei; efectul de mai jos o ascunde
  // imediat dacă sistemul cere mișcare redusă.
  const [phase, setPhase] = useState<"play" | "exit" | "gone">("play");
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    const start = decide();
    const elapsed = performance.now() - start;
    if (start < 0 || elapsed >= GONE_AT) {
      setPhase("gone");
      return;
    }
    const t1 = setTimeout(() => setPhase("exit"), Math.max(0, EXIT_AT - elapsed));
    const t2 = setTimeout(() => setPhase("gone"), GONE_AT - elapsed);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "gone") return null;

  const skip = () => {
    setPhase("exit");
    setTimeout(() => setPhase("gone"), 450);
  };

  return (
    <div
      className={`intro-splash fixed inset-0 z-200 flex cursor-pointer select-none flex-col items-center justify-center overflow-hidden bg-paper ${phase === "exit" ? "intro-exit" : ""}`}
      onClick={skip}
      role="presentation"
      aria-hidden
    >
      {/* Rozetele, centrate pe siglă */}
      <svg viewBox="0 0 400 400" className="intro-rings pointer-events-none absolute left-1/2 top-1/2 h-[min(118vw,640px)] w-[min(118vw,640px)] text-leu">
        {RINGS.map((d, i) => (
          <path key={i} d={d} pathLength={1} className="intro-ring" style={{ animationDelay: `${i * 120}ms`, opacity: 0.32 - i * 0.06 }} fill="none" stroke="currentColor" strokeWidth={0.5} />
        ))}
      </svg>

      <div className="relative flex flex-col items-center">
        <svg viewBox="0 0 64 64" className="intro-mark h-[88px] w-[88px] drop-shadow-[0_14px_28px_rgb(0_0_0/0.22)] sm:h-24 sm:w-24">
          <LogoArt id={id} />
        </svg>

        <div className="mt-6 flex text-[44px] font-semibold leading-none tracking-[-0.05em] text-ink sm:text-[52px]">
          {[...WORD].map((ch, i) => (
            <span key={i} className="intro-letter inline-block" style={{ animationDelay: `${620 + i * 55}ms` }}>
              {ch}
            </span>
          ))}
        </div>

        <div className="mt-4 flex gap-1.5">
          {BANDS.map((c, i) => (
            <span key={c} className="intro-band h-1 w-8 rounded-full" style={{ background: c, animationDelay: `${1000 + i * 80}ms` }} />
          ))}
        </div>

        <div className="intro-tag mt-4 text-[13px] text-ink-soft">Bugetul tău, ban cu ban</div>
      </div>

      <span className="intro-hint absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] text-[12px] text-ink-faint">
        Atinge pentru a continua
      </span>
    </div>
  );
}

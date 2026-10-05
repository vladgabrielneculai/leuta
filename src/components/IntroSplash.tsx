"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";

const BANDS = ["var(--c-leu)", "var(--c-mov)", "var(--c-rosu)", "var(--c-galben)", "var(--c-albastru)"];
const WORD = "Leuța";
// Momentul în care animația începe să se estompeze, apoi dispare cu totul (ms).
const EXIT_AT = 2300;
const GONE_AT = 2850;

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
 * Animația de început de pe ecranul de autentificare: moneda-siglă cade rotindu-se, primește
 * luciul de monedă, benzile în culorile bancnotelor (1, 5, 10, 50, 100 lei) se umplu pe rând,
 * apoi apare numele. Se vede la fiecare încărcare a paginii, se poate sări cu o atingere și nu
 * rulează deloc dacă sistemul cere mișcare redusă.
 */
export default function IntroSplash() {
  // Pornește vizibilă, ca formularul să nu apară o clipă înaintea ei; efectul de mai jos o ascunde
  // imediat dacă sistemul cere mișcare redusă.
  const [phase, setPhase] = useState<"play" | "exit" | "gone">("play");

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
      className={`intro-splash fixed inset-0 z-[200] flex cursor-pointer select-none flex-col items-center justify-center bg-paper ${phase === "exit" ? "intro-exit" : ""}`}
      onClick={skip}
      role="presentation"
      aria-hidden
    >
      <div className="guilloche guilloche-full intro-backdrop absolute inset-0" />

      <div className="relative flex flex-col items-center">
        {/* Moneda: cade, se rotește ca o monedă aruncată, apoi o trece o lumină */}
        <div className="intro-coin-wrap">
          <div className="intro-coin relative h-28 w-28 sm:h-32 sm:w-32">
            <Logo className="h-full w-full drop-shadow-xl" />
            <span className="absolute inset-0 overflow-hidden rounded-full">
              <span className="intro-shine" />
            </span>
          </div>
          <span className="intro-coin-shadow" />
        </div>

        {/* Benzile în culorile bancnotelor */}
        <div className="mt-7 flex gap-1.5">
          {BANDS.map((c, i) => (
            <span key={c} className="intro-band h-1.5 w-8 rounded-full sm:w-10" style={{ background: c, animationDelay: `${900 + i * 90}ms` }} />
          ))}
        </div>

        {/* Numele, literă cu literă */}
        <div className="mt-5 flex font-display text-[44px] font-bold leading-none tracking-tight text-ink sm:text-[52px]">
          {WORD.split("").map((ch, i) => (
            <span key={i} className="intro-letter inline-block" style={{ animationDelay: `${1250 + i * 70}ms` }}>
              {ch}
            </span>
          ))}
        </div>
        <p className="intro-tagline mt-3 text-[15px] text-ink-soft">Bugetul tău, ban cu ban</p>
      </div>

      <span className="intro-hint absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] text-[12px] text-ink-faint">
        Atinge pentru a continua
      </span>
    </div>
  );
}

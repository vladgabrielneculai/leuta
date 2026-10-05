"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";
import { Barcode } from "./receipt";

const BANDS = ["var(--c-leu)", "var(--c-mov)", "var(--c-rosu)", "var(--c-galben)", "var(--c-albastru)"];
// Momentul în care animația începe să se estompeze, apoi dispare cu totul (ms).
const EXIT_AT = 2800;
const GONE_AT = 3300;

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
 * Animația de început de pe ecranul de autentificare: moneda-siglă cade rotindu-se pe o casă de marcat,
 * primește luciul de monedă și intră în fantă; din fantă se tipărește apoi un bon cu numele aplicației,
 * benzile în culorile bancnotelor (1, 5, 10, 50, 100 lei) și un cod de bare. Se vede la fiecare încărcare
 * a paginii, se poate sări cu o atingere și nu rulează deloc dacă sistemul cere mișcare redusă.
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
        {/* Moneda: cade rotindu-se, o trece o lumină, apoi intră în fantă */}
        <div className="intro-coin-insert relative z-[1]">
          <div className="intro-coin relative h-24 w-24 sm:h-28 sm:w-28">
            <Logo className="h-full w-full" />
            <span className="absolute inset-0 overflow-hidden rounded-full">
              <span className="intro-shine" />
            </span>
          </div>
        </div>

        {/* Fanta casei de marcat */}
        <span className="intro-slot relative z-[2] block h-3 w-64 rounded-full bg-[#14120f] ring-1 ring-line-strong/60 sm:w-72" />

        {/* Bonul tipărit din fantă */}
        <div className="-mt-1.5 w-56 overflow-hidden px-3 pb-3 sm:w-64">
          <div className="intro-paper panel !mt-0 px-4 pb-4 pt-5 text-center font-mono">
            <div className="text-[34px] font-bold leading-none tracking-[-0.04em] text-ink sm:text-[38px]">Leuța</div>
            <div className="mt-2 whitespace-nowrap text-[10px] uppercase tracking-[0.06em] text-ink-soft">Bugetul tău, ban cu ban</div>
            <div className="rule-dashed my-3" />
            <div className="flex justify-center gap-1">
              {BANDS.map((c) => (
                <span key={c} className="h-1.5 w-7 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <div className="rule-dashed my-3" />
            <Barcode seed="Leuța" className="mx-auto h-8 w-40 text-ink" />
            <div className="mt-1.5 text-[9.5px] tracking-[0.22em] text-ink-faint" suppressHydrationWarning>LEU 0001 {new Date().getFullYear()}</div>
          </div>
        </div>
      </div>

      <span className="intro-hint absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] text-[12px] text-ink-faint">
        Atinge pentru a continua
      </span>
    </div>
  );
}

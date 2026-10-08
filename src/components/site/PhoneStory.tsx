"use client";

import { useRef, useState } from "react";
import Phone from "./Phone";
import { clamp, ease, range, useScrollEffect } from "@/lib/site/scroll";

/**
 * Povestea aplicației, pas cu pas: telefonul rămâne fix pe ecran, iar derularea paginii derulează
 * ecranele din aplicație (capturi reale din contul demonstrativ). Pasul „Adăugare rapidă” redă
 * adăugarea unei cheltuieli: „+”, suma, categoria, „Adaugă”.
 */

/** Înălțimea capturilor întregi, în pixeli din aplicație (lățimea e 390). */
const FULL = { "nonav-home": 3929, "nonav-luna": 3385, "nonav-credite": 2265, "nonav-economii": 1588 } as const;
const VIEW = 844; // înălțimea zonei aplicației sub bara de stare

type Step =
  | { kind: "scroll"; img: keyof typeof FULL; nav: string; to: number; kicker: string; title: string; text: string; color: string }
  | { kind: "quick"; kicker: string; title: string; text: string; color: string };

const STEPS: Step[] = [
  {
    kind: "scroll",
    img: "nonav-home",
    nav: "navbar",
    to: 1500,
    kicker: "Panou",
    title: "Toată luna, pe un singur ecran.",
    text: "Cât a intrat, cât a ieșit și cât a rămas. Plus ce să faci luna asta: fondul de urgență, rata de economisire, dobânzile care se schimbă.",
    color: "var(--c-leu)",
  },
  {
    kind: "quick",
    kicker: "Adăugare rapidă",
    title: "O cheltuială. Trei atingeri.",
    text: "Apeși „+”, scrii suma, alegi categoria. Bugetul lunii se recalculează pe loc. Merge și în euro, cu cursul BNR al zilei.",
    color: "var(--c-mov)",
  },
  {
    kind: "scroll",
    img: "nonav-luna",
    nav: "navbar-luna",
    to: 2300,
    kicker: "Luna curentă",
    title: "Un bon pentru fiecare lună.",
    text: "Venituri, costuri fixe, cheltuieli și economii, cu subtotaluri. Intrările lunare se copiază în luna următoare dintr-un buton.",
    color: "var(--c-rosu)",
  },
  {
    kind: "scroll",
    img: "nonav-credite",
    nav: "navbar-credite",
    to: FULL["nonav-credite"] - VIEW,
    kicker: "Credite",
    title: "Creditele tale, la vedere.",
    text: "Sold rămas, dobândă de plătit, rate pe venit. Încarci graficul de rambursare din PDF sau Excel și vezi cât câștigi plătind anticipat.",
    color: "var(--c-galben)",
  },
  {
    kind: "scroll",
    img: "nonav-economii",
    nav: "navbar-economii",
    to: FULL["nonav-economii"] - VIEW,
    kicker: "Economii",
    title: "Economii care chiar cresc.",
    text: "Fondul de urgență măsurat în luni de cheltuieli, obiective cu termen și suma lunară necesară ca să ajungi la timp.",
    color: "var(--c-albastru)",
  },
];

/** Cadrele adăugării rapide și momentul (0–1 din pas) în care apar. */
const QUICK: [number, string][] = [
  [0, "qa-0"],
  [0.16, "qa-1"],
  [0.3, "qa-21"],
  [0.34, "qa-22"],
  [0.38, "qa-23"],
  [0.42, "qa-24"],
  [0.46, "qa-25"],
  [0.58, "qa-3"],
  [0.7, "qa-4"],
  [0.84, "qa-5"],
];
/** Unde atinge degetul (pixeli din aplicație) și când. */
const TAPS: [number, [number, number]][] = [
  [0.12, [195, 814]],
  [0.54, [70, 348]],
  [0.8, [195, 788]],
];

export default function PhoneStory() {
  const ref = useRef<HTMLElement>(null);
  const imgs = useRef<Record<string, HTMLImageElement | null>>({});
  const tap = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useScrollEffect(ref, "sticky", (p) => {
    const f = clamp(p * STEPS.length, 0, STEPS.length - 0.0001);
    const idx = Math.floor(f);
    const local = f - idx;
    setActive((a) => (a === idx ? a : idx));

    const visible = new Set<string>();
    const step = STEPS[idx];
    if (step.kind === "scroll") {
      visible.add(step.img).add(step.nav);
      const el = imgs.current[step.img];
      const y = step.to * ease(range(local, 0.12, 0.88));
      if (el) el.style.transform = `translateY(calc(${-y} * var(--u)))`;
    } else {
      let cur = QUICK[0][1];
      for (const [at, name] of QUICK) if (local >= at) cur = name;
      visible.add(cur);
    }
    for (const [key, el] of Object.entries(imgs.current)) if (el) el.style.opacity = visible.has(key) ? "1" : "0";

    // atingerea: un cerc care se lărgește și dispare
    const t = tap.current;
    if (t) {
      let shown = false;
      if (step.kind === "quick")
        for (const [at, [x, y]] of TAPS) {
          const d = (local - at) / 0.06;
          if (d >= 0 && d <= 1) {
            t.style.left = `calc(${x} * var(--u))`;
            t.style.top = `calc(${y} * var(--u))`;
            t.style.opacity = String(1 - d);
            t.style.transform = `translate(-50%, -50%) scale(${0.6 + d * 0.8})`;
            shown = true;
          }
        }
      if (!shown) t.style.opacity = "0";
    }
  });

  const s = STEPS[active];
  const setImg = (key: string) => (el: HTMLImageElement | null) => {
    imgs.current[key] = el;
  };

  return (
    <section ref={ref} id="functii" className="relative" style={{ height: `${STEPS.length * 110 + 30}vh` }} aria-label="Cum arată aplicația">
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden pt-16">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-4 px-4 sm:px-6 md:grid-cols-[1fr_auto] md:gap-12">
          {/* Textul pasului curent */}
          <div className="min-h-[150px] md:min-h-0">
            <div key={active} className="rise">
              <p className="kicker flex items-center gap-2">
                <span className="h-2.5 w-6 rounded-full" style={{ background: s.color }} />
                {String(active + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")} · {s.kicker}
              </p>
              <h2 className="mt-3 text-[26px] font-bold leading-[1.08] sm:text-[44px]">{s.title}</h2>
              <p className="mt-3 max-w-[32rem] text-[14.5px] text-ink-soft sm:text-[17px]">{s.text}</p>
            </div>
            {/* Lista pașilor, ca rândurile unui bon */}
            <ol className="mt-10 hidden max-w-sm space-y-2 text-[14px] md:block">
              {STEPS.map((st, i) => (
                <li key={st.kicker} className="flex items-baseline gap-2 transition-colors" style={{ color: i === active ? "rgb(var(--ink))" : "rgb(var(--ink-faint))" }}>
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: i <= active ? st.color : "rgb(var(--line-strong))" }} />
                  <span className={i === active ? "font-semibold" : ""}>{st.kicker}</span>
                  <span className="leader-dots min-w-[1rem] flex-1" />
                  <span className="num">{i < active ? "✓" : i === active ? "•" : ""}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex justify-center">
            <Phone width="min(74vw, calc((100svh - 300px) * 0.45), 340px)" className="md:![--pw:min(360px,calc((100svh_-_130px)*0.45))]">
              {(Object.keys(FULL) as (keyof typeof FULL)[]).map((k) => (
                <img key={k} ref={setImg(k)} src={`/ecrane/${k}.webp`} alt="" width={780} style={{ top: 0, opacity: 0 }} decoding="async" />
              ))}
              {["navbar", "navbar-luna", "navbar-credite", "navbar-economii"].map((k) => (
                <img key={k} ref={setImg(k)} src={`/ecrane/${k}.webp`} alt="" width={780} style={{ top: "auto", bottom: 0, opacity: 0, zIndex: 2 }} decoding="async" />
              ))}
              {QUICK.map(([, k]) => (
                <img key={k} ref={setImg(k)} src={`/ecrane/${k}.webp`} alt="" width={780} style={{ top: 0, opacity: 0, zIndex: 2 }} decoding="async" />
              ))}
              <div
                ref={tap}
                aria-hidden
                className="pointer-events-none absolute z-10 rounded-full border-[3px] border-ink/50 bg-ink/20"
                style={{ width: "calc(56 * var(--u))", height: "calc(56 * var(--u))", opacity: 0 }}
              />
            </Phone>
          </div>
        </div>
      </div>
      <p className="sr-only">
        Capturi din aplicație: Panoul, adăugarea rapidă a unei cheltuieli, pagina Luna curentă, Credite și Economii.
      </p>
    </section>
  );
}

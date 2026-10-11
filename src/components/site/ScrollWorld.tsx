"use client";

import { forwardRef, useEffect, useRef, type CSSProperties, type MutableRefObject, type RefObject } from "react";
import { SITE } from "@/lib/site/config";
import { money } from "@/lib/site/format";
import { ease, measure, range, usePrefersReducedMotion } from "@/lib/site/scroll";
import Hero from "./Hero";
import Allocation from "./Allocation";

/**
 * „Lumea” de la începutul paginii: o scenă 3D (doar CSS) prin care camera înaintează la derulare.
 * Pe drum treci pe lângă bancnote care plutesc și pe lângă cele cinci capitole ale lunii (venit, costuri
 * fixe, rate, cheltuieli, economii). La capăt ajungi la bonul cheltuielilor: cheltuielile lunii zboară pe
 * bon una câte una, iar Leuța arată cât ai cheltuit și cât mai poți cheltui pe zi.
 * Cu „reduce motion” activ, pagina arată prima secțiune și împărțirea venitului, fără scenă.
 *
 * Performanță: totul se mișcă doar prin `transform` și `opacity` (fără umbre, filtre sau măști pe
 * elementele 3D), iar stilurile se scriu doar când valoarea chiar s-a schimbat.
 */

const INCOME = 10080;
const GAP = 1500; // distanța dintre capitole, în adâncime
const CHAPTERS = [
  { label: "Venit", value: INCOME, color: "var(--c-leu)", text: "Salariul intră pe 1. Leuța îl întâmpină și îl împarte." },
  { label: "Costuri fixe", value: 300, color: "var(--c-albastru)", text: "Chirie, abonamente, utilități. Știi dinainte cât pleacă." },
  { label: "Rate credite", value: 2760.72, color: "var(--c-mov)", text: "Fiecare rată, cu dobânda și ce mai ai de plătit." },
  { label: "Cheltuieli variabile", value: 4900, color: "var(--c-rosu)", text: "Mâncare, transport, ieșiri. Le adaugi în trei atingeri." },
  { label: "Economii", value: 1600, color: "var(--c-galben)", text: "Banii pentru viitor, puși deoparte înainte să dispară." },
];
const PARTS = CHAPTERS.slice(1);
const END = (CHAPTERS.length + 1) * GAP; // adâncimea bonului de la final

/** Bugetul de cheltuieli variabile al lunii și ce s-a cheltuit deja din el. */
const BUDGET = 4900;
const SPENT_BEFORE = 2480.1;
const DAYS_LEFT = 20;
/** Cheltuielile care „aterizează” pe bon la final. */
const EXPENSES = [
  { name: "Supermarket", cat: "Mâncare", value: 312.4, color: "var(--c-rosu)" },
  { name: "Benzină", cat: "Transport", value: 250, color: "var(--c-albastru)" },
  { name: "Cafenea", cat: "Ieșiri", value: 18.5, color: "var(--c-mov)" },
  { name: "Farmacie", cat: "Sănătate", value: 64.9, color: "var(--c-leu)" },
  { name: "Cinema", cat: "Ieșiri", value: 72, color: "var(--c-galben)" },
];
const SPENT_AFTER = SPENT_BEFORE + EXPENSES.reduce((s, e) => s + e.value, 0);

/** Partea din derulare în care camera înaintează; restul e scena de la bon. */
const TRAVEL = 0.6;

const NOTE_COLORS: Record<number, string> = { 1: "var(--c-leu)", 5: "var(--c-mov)", 10: "var(--c-rosu)", 50: "var(--c-galben)", 100: "var(--c-albastru)" };

/** Generator pseudo-aleator cu sămânță fixă: aceeași lume la fiecare încărcare (și pe server). */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const COUNT = 28;
type Thing = { coin: boolean; x: number; y: number; z: number; rx: number; ry: number; rz: number; value: number; spin: number };
const THINGS: Thing[] = (() => {
  const r = rng(20261007);
  const values = [1, 5, 10, 50, 100];
  return Array.from({ length: COUNT }, (_, i) => ({
    coin: i % 4 === 3,
    x: (i % 2 ? 1 : -1) * (380 + r() * 900),
    y: -380 + r() * 760,
    z: -(300 + (i / COUNT) * (END - 900) + r() * 300),
    rx: -25 + r() * 50,
    ry: -40 + r() * 80,
    rz: -35 + r() * 70,
    value: values[Math.floor(r() * values.length)],
    spin: (r() - 0.5) * 140,
  }));
})();

/** Scrie un stil doar dacă s-a schimbat (fiecare scriere inutilă costă un cadru). */
function set(el: HTMLElement | null, prop: "opacity" | "transform" | "visibility" | "width", value: string) {
  if (el && el.style[prop] !== value) el.style[prop] = value;
}
function fade(el: HTMLElement | null, vis: number) {
  set(el, "opacity", vis.toFixed(3));
  set(el, "visibility", vis < 0.01 ? "hidden" : "visible");
}

export default function ScrollWorld() {
  const reduced = usePrefersReducedMotion();
  if (reduced)
    return (
      <>
        <Hero />
        <Allocation />
      </>
    );
  return <World />;
}

function World() {
  const section = useRef<HTMLElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const ground = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const things = useRef<(HTMLDivElement | null)[]>([]);
  const hudBars = useRef<(HTMLSpanElement | null)[]>([]);
  const hudRest = useRef<HTMLSpanElement>(null);
  const hudStep = useRef<HTMLSpanElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const lines = useRef<(HTMLLIElement | null)[]>([]);
  const spent = useRef<HTMLSpanElement>(null);
  const spentBar = useRef<HTMLSpanElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const perDay = useRef<HTMLSpanElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const captionInline = useRef<HTMLDivElement>(null);
  const finale = useRef<HTMLDivElement>(null);
  const fog = useRef<HTMLDivElement>(null);
  const cta = useRef<HTMLDivElement>(null);
  const narrow = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    // pe ecrane joase, textul și bonul de la final se micșorează ca să încapă între bară și butoane
    const fit = () => {
      const el = finale.current;
      if (el) el.style.setProperty("--fit", String(Math.min(1, (window.innerHeight - 190) / Math.max(1, el.offsetHeight))));
    };
    const onMq = () => {
      narrow.current = mq.matches;
      fit();
    };
    onMq();
    mq.addEventListener("change", onMq);

    // Derularea dă ținta; camera o ajunge din urmă lin. Bucla rulează doar cât camera mai are drum de făcut.
    const goalNow = () => (section.current ? measure(section.current, "sticky") : 0);
    let cam = -1;
    let raf = 0;
    let running = false;
    const frame = () => {
      const goal = goalNow();
      cam = cam < 0 ? goal : cam + (goal - cam) * 0.2;
      if (Math.abs(goal - cam) < 0.0002) cam = goal;
      render(cam);
      running = cam !== goal;
      if (running) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    window.addEventListener("resize", fit);

    const render = (p: number) => {
      const z = ease(range(p, 0, TRAVEL)) * (END - 80); // camera, care se oprește chiar în fața bonului
      const q = range(p, TRAVEL, 0.97); // scena de la bon: 0 → 1
      const n = narrow.current;
      const sway = Math.sin(p * Math.PI * 3) * 3;
      set(world.current, "transform", `rotateY(${sway.toFixed(2)}deg) translateZ(${z.toFixed(1)}px)`);
      // podeaua e desenată în planul ecranului; doar grila ei alunecă (modulo o celulă), deci nu se redesenează
      set(ground.current, "transform", `translate3d(0, ${((z * 0.35) % 120).toFixed(1)}px, 0)`);

      // capitolele: apar din ceață, se citesc, apoi se dau la o parte înainte să treacă prin cameră
      CHAPTERS.forEach((_, i) => {
        const el = items.current[i];
        const rel = z - (i + 1) * GAP; // < 0 încă în față
        // cât timp titlul e pe ecran, capitolele din spate nu se văd prin el
        const vis = range(rel, -3200, -2000) * (1 - range(rel, -380, 120)) * range(z, 300, 800);
        fade(el, vis);
        if (vis < 0.01) return;
        const side = i % 2 ? 1 : -1;
        const push = range(rel, -700, 200) * 260; // se dau în lături când te apropii
        set(el, "transform", `translate3d(calc(-50% + ${(side * ((n ? 30 : 360) + push)).toFixed(1)}px), -50%, ${-(i + 1) * GAP}px) rotateY(${-side * (n ? 6 : 14)}deg)`);
      });

      // titlul de la început se îndepărtează lent
      fade(items.current[CHAPTERS.length], 1 - range(z, 0, 800));
      // bonul de la final
      fade(items.current[CHAPTERS.length + 1], range(z - END, -2800, -1400));

      THINGS.forEach((t, i) => {
        const el = things.current[i];
        const rel = z + t.z;
        const vis = n && i % 2 ? 0 : range(rel, -3800, -2400) * (1 - range(rel, 250, 650));
        fade(el, vis);
        if (vis < 0.01) return;
        const x = n ? t.x * 0.45 : t.x;
        set(el, "transform", `translate3d(${x.toFixed(0)}px, ${t.y.toFixed(0)}px, ${t.z.toFixed(0)}px) rotateX(${t.rx.toFixed(1)}deg) rotateY(${(t.ry + p * t.spin).toFixed(1)}deg) rotateZ(${(t.rz + p * t.spin * 0.4).toFixed(1)}deg)`);
      });

      // finalul: cheltuielile zboară pe bon una câte una, iar totalurile se actualizează
      let total = SPENT_BEFORE;
      EXPENSES.forEach((e, i) => {
        const f = ease(range(q, 0.04 + i * 0.12, 0.16 + i * 0.12));
        total += e.value * f;
        const el = lines.current[i];
        const side = i % 2 ? 1 : -1;
        set(el, "opacity", Math.min(1, f * 1.6).toFixed(3));
        set(el, "transform", `translate(${(side * (1 - f) * 420).toFixed(1)}px, ${((1 - f) * -140).toFixed(1)}px) rotate(${(side * (1 - f) * 14).toFixed(1)}deg) scale(${(1 + (1 - f) * 0.2).toFixed(3)})`);
      });
      if (spent.current) spent.current.textContent = money(total);
      set(spentBar.current, "width", `${((total / BUDGET) * 100).toFixed(2)}%`);
      if (left.current) left.current.textContent = money(BUDGET - total);
      if (perDay.current) perDay.current.textContent = money((BUDGET - total) / DAYS_LEFT);

      set(fog.current, "opacity", (1 - range(q, 0, 0.1)).toFixed(3)); // la bon nu mai e ceață
      // textul scenei: în stânga pe calculator, deasupra bonului pe telefon (unul dintre ele e ascuns din CSS)
      const s = q < 0.3 ? "0" : q < 0.66 ? "1" : "2";
      for (const el of [caption.current, captionInline.current]) {
        if (!el) continue;
        set(el, "opacity", range(q, 0, 0.05).toFixed(3));
        if (el.dataset.step !== s) el.dataset.step = s;
      }
      if (cta.current) {
        const show = ease(range(q, 0.8, 0.92));
        fade(cta.current, show);
        cta.current.style.setProperty("--rise", `${((1 - show) * 20).toFixed(1)}px`);
      }

      // bonul mic de jos: ce s-a alocat până acum
      let used = 0;
      let step = 0;
      PARTS.forEach((part, i) => {
        const f = ease(range(z, (i + 2) * GAP - 900, (i + 2) * GAP - 200));
        if (f > 0.5) step = i + 1;
        used += part.value * f;
        set(hudBars.current[i], "width", `${((part.value / INCOME) * 100 * f).toFixed(2)}%`);
      });
      if (hudRest.current) hudRest.current.textContent = money(INCOME - used);
      if (hudStep.current) hudStep.current.textContent = `${step}/${PARTS.length}`;
      const show = range(z, GAP - 900, GAP - 300) * (1 - range(p, TRAVEL - 0.03, TRAVEL + 0.01));
      fade(hud.current, show);
      set(hud.current, "transform", `translate(-50%, ${((1 - show) * 24).toFixed(1)}px)`);
      set(hint.current, "opacity", (1 - range(p, 0, 0.03)).toFixed(3));
    };

    cam = goalNow();
    render(cam);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
      window.removeEventListener("resize", fit);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  const at = (z: number): CSSProperties => ({ transform: `translate3d(-50%, -50%, ${z}px)` });

  return (
    <section ref={section} className="relative h-[1000vh]" aria-label="O lună din bugetul tău">
      <div className="sw-stage sticky top-0 h-[100svh] overflow-hidden">
        <div className="sw-ground" aria-hidden>
          <div ref={ground} className="sw-ground-grid" />
        </div>

        {/* Scena 3D: bancnotele (decor) și textele, toate în aceeași lume prin care înaintează camera. */}
        <div className="sw-scene">
          <div ref={world} className="sw-world">
            {THINGS.map((t, i) => (
              <div key={i} ref={(el) => void (things.current[i] = el)} className="sw-thing" aria-hidden>
                {t.coin ? <div className="sw-coin">L</div> : <Note value={t.value} />}
              </div>
            ))}
            {CHAPTERS.map((c, i) => (
              <div key={c.label} ref={(el) => void (items.current[i] = el)} className="sw-item" style={at(-(i + 1) * GAP)}>
                <Chapter index={i} {...c} />
              </div>
            ))}
            <div ref={(el) => void (items.current[CHAPTERS.length] = el)} className="sw-item w-[min(92vw,820px)]" style={at(0)}>
              <Intro />
            </div>
            <div ref={(el) => void (items.current[CHAPTERS.length + 1] = el)} className="sw-item" style={at(-END)}>
              <div ref={finale} className="sw-finale">
                <Caption ref={captionInline} className="sw-caption-inline" />
                <Spending lines={lines} spent={spent} spentBar={spentBar} left={left} perDay={perDay} />
              </div>
            </div>
          </div>
        </div>

        <div ref={fog} className="sw-fog" aria-hidden />

        <div ref={hud} className="sw-hud" aria-hidden style={{ opacity: 0 }}>
          <div className="flex items-baseline justify-between gap-4 text-[12px] uppercase tracking-[0.12em] text-ink-faint">
            <span>
              Alocat <span ref={hudStep} className="num">0/4</span>
            </span>
            <span className="normal-case tracking-normal">
              Rest <span ref={hudRest} className="num font-semibold text-ink">{money(INCOME)}</span> lei
            </span>
          </div>
          <div className="mt-2 flex h-2 gap-[2px] overflow-hidden rounded-[3px] bg-line/70">
            {PARTS.map((p, i) => (
              <span key={p.label} ref={(el) => void (hudBars.current[i] = el)} style={{ width: 0, background: p.color }} />
            ))}
          </div>
        </div>

        <Caption ref={caption} className="sw-caption" />

        <div ref={cta} className="sw-cta" style={{ opacity: 0, visibility: "hidden" }}>
          <a href="#invitatie" className="btn-primary">
            Vreau bonul meu <span aria-hidden>›</span>
          </a>
          <a href={`${SITE.appUrl}/login`} className="btn-ghost bg-paper">
            Am deja cont
          </a>
        </div>

        <div ref={hint} className="sw-hint" aria-hidden>
          <span>Derulează</span>
          <span className="sw-hint-line" />
        </div>
      </div>
    </section>
  );
}

/** Textul scenei de la final, în trei pași (`data-step`). */
const Caption = forwardRef<HTMLDivElement, { className: string }>(function Caption({ className }, ref) {
  return (
    <div ref={ref} className={className} data-step="0" style={{ opacity: 0 }}>
      <p className="kicker">Cheltuieli variabile · octombrie</p>
      <h2 className="sw-cap sw-cap-0">Cheltuiești.</h2>
      <h2 className="sw-cap sw-cap-1">Leuța ține socoteala.</h2>
      <h2 className="sw-cap sw-cap-2">Și îți spune cât mai poți cheltui.</h2>
      <p className="sw-cap-text mt-3 text-[14.5px] leading-relaxed text-ink-soft sm:text-[16px]">
        Fiecare cheltuială intră pe bonul lunii, la categoria ei. Vezi pe loc cât ai cheltuit din buget și cât îți rămâne pe zi.
      </p>
    </div>
  );
});

function Intro() {
  return (
    <div className="text-center">
      <p className="kicker rise">Bon nr. 0001 · Bugetul personal</p>
      <h1 className="rise mt-5 text-[40px] font-bold leading-[1.03] sm:text-[60px] lg:text-[76px]" style={{ animationDelay: "80ms" }}>
        Bugetul tău, clar ca un bon.
      </h1>
      <p className="rise mx-auto mt-6 max-w-[36rem] text-[16px] leading-relaxed text-ink-soft sm:text-[17px]" style={{ animationDelay: "160ms" }}>
        Intră în luna ta. Leuța îți arată unde merge fiecare leu: venituri, cheltuieli, rate și economii. Fără foi de calcul și fără acces la contul
        tău bancar.
      </p>
      <div className="rise mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "240ms" }}>
        <a href="#invitatie" className="btn-primary">
          Cere o invitație <span aria-hidden>›</span>
        </a>
        <a href="#functii" className="btn-ghost bg-paper">
          Vezi cum funcționează
        </a>
      </div>
    </div>
  );
}

function Chapter({ index, label, value, color, text }: { index: number; label: string; value: number; color: string; text: string }) {
  const pct = Math.round((value / INCOME) * 100);
  return (
    <div className="panel w-[min(84vw,440px)] px-7 pb-7 pt-6">
      <div className="flex items-center justify-between text-[12px] uppercase tracking-[0.16em] text-ink-faint">
        <span>Capitolul {String(index + 1).padStart(2, "0")}</span>
        <span>{index === 0 ? "+ intrare" : `${pct}% din venit`}</span>
      </div>
      <div className="rule-dashed my-4" />
      <p className="flex items-center gap-2.5 text-[17px] font-semibold">
        <span className="h-3.5 w-3.5 rounded-[3px]" style={{ background: color }} aria-hidden />
        {label}
      </p>
      <p className="num mt-2 text-[44px] font-bold leading-none sm:text-[54px]" style={{ color }}>
        {index === 0 ? "+" : "−"}
        {money(value)} <span className="text-[18px] font-medium text-ink-soft">lei</span>
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{text}</p>
    </div>
  );
}

type Refs = {
  lines: MutableRefObject<(HTMLLIElement | null)[]>;
  spent: RefObject<HTMLSpanElement>;
  spentBar: RefObject<HTMLSpanElement>;
  left: RefObject<HTMLSpanElement>;
  perDay: RefObject<HTMLSpanElement>;
};

/** Bonul cheltuielilor variabile: bugetul, cheltuielile lunii și cât mai poți cheltui. */
function Spending({ lines, spent, spentBar, left, perDay }: Refs) {
  return (
    <div className="panel w-[min(90vw,400px)] px-6 pb-6 pt-6 text-[13.5px]">
      <div className="text-center">
        <p className="text-[16px] font-bold tracking-tight">LEUȚA</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-ink-faint">Cheltuieli variabile · octombrie 2026</p>
      </div>
      <div className="rule-dashed my-4" />
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">Buget</span>
        <span className="num font-bold">{money(BUDGET)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between text-ink-soft">
        <span>Cheltuit până acum</span>
        <span className="num">− {money(SPENT_BEFORE)}</span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {EXPENSES.map((e, i) => (
          <li key={e.name} ref={(el) => void (lines.current[i] = el)} className="sw-line" style={{ opacity: 0 }}>
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: e.color }} aria-hidden />
            <span className="font-medium">{e.name}</span>
            <span className="text-[11.5px] text-ink-faint">{e.cat}</span>
            <span className="leader-dots min-w-[0.75rem] flex-1" aria-hidden />
            <span className="num font-semibold">− {money(e.value)}</span>
          </li>
        ))}
      </ul>
      <div className="rule-double my-4" />
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">CHELTUIT</span>
        <span className="num text-[18px] font-bold text-rosu">
          <span ref={spent}>{money(SPENT_BEFORE)}</span> <span className="text-[12px] font-medium">lei</span>
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-[3px] bg-line/80" aria-hidden>
        <span ref={spentBar} className="block h-full bg-rosu" style={{ width: `${(SPENT_BEFORE / BUDGET) * 100}%` }} />
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="font-semibold">MAI POȚI CHELTUI</span>
        <span className="num text-[22px] font-bold text-leu">
          <span ref={left}>{money(BUDGET - SPENT_BEFORE)}</span> <span className="text-[12px] font-medium">lei</span>
        </span>
      </div>
      <p className="mt-1 text-right text-[12px] text-ink-faint">
        ≈ <span ref={perDay} className="num font-semibold text-ink-soft">{money((BUDGET - SPENT_BEFORE) / DAYS_LEFT)}</span> lei pe zi, {DAYS_LEFT} zile
        rămase
      </p>
      <p className="sr-only">
        După aceste cheltuieli ai cheltuit {money(SPENT_AFTER)} lei din {money(BUDGET)} și mai poți cheltui {money(BUDGET - SPENT_AFTER)} lei.
      </p>
    </div>
  );
}

function Note({ value }: { value: number }) {
  return (
    <div className="sw-note" style={{ "--note": NOTE_COLORS[value] } as CSSProperties}>
      <span className="sw-note-value num">{value}</span>
      <span className="sw-note-seal" />
      <span className="sw-note-word">{value === 1 ? "LEU" : "LEI"}</span>
      <span className="sw-note-value sw-note-value-b num">{value}</span>
    </div>
  );
}

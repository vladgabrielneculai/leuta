"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { SITE } from "@/lib/site/config";
import { money } from "@/lib/site/format";
import { ease, range, usePrefersReducedMotion, useScrollEffect } from "@/lib/site/scroll";
import Barcode from "./Barcode";
import Hero from "./Hero";
import Allocation from "./Allocation";

/**
 * „Lumea” de la începutul paginii: o scenă 3D (doar CSS) prin care camera înaintează la derulare.
 * Pe drum treci pe lângă bancnote care plutesc și pe lângă cele cinci capitole ale lunii (venit, costuri
 * fixe, rate, cheltuieli, economii). La capăt e o casă de marcat: apropii cardul de POS, plata e aprobată și
 * din fantă iese bonul lunii, cu restul nealocat.
 * Cu „reduce motion” activ, pagina arată prima secțiune și împărțirea venitului, fără scenă.
 */

const INCOME = 10080;
const PERSPECTIVE = 1000;
const GAP = 1700; // distanța dintre capitole, în adâncime
const CHAPTERS = [
  { label: "Venit", value: INCOME, color: "var(--c-leu)", note: 100, text: "Salariul intră pe 1. Leuța îl întâmpină și îl împarte." },
  { label: "Costuri fixe", value: 300, color: "var(--c-albastru)", note: 100, text: "Chirie, abonamente, utilități. Știi dinainte cât pleacă." },
  { label: "Rate credite", value: 2760.72, color: "var(--c-mov)", note: 5, text: "Fiecare rată, cu dobânda și ce mai ai de plătit." },
  { label: "Cheltuieli variabile", value: 4900, color: "var(--c-rosu)", note: 10, text: "Mâncare, transport, ieșiri. Le adaugi în trei atingeri." },
  { label: "Economii", value: 1600, color: "var(--c-galben)", note: 50, text: "Banii pentru viitor, puși deoparte înainte să dispară." },
];
const PARTS = CHAPTERS.slice(1);
const REST = INCOME - PARTS.reduce((s, p) => s + p.value, 0);
const END = (CHAPTERS.length + 1) * GAP; // adâncimea bonului final

/** O plată oarecare cu cardul, cea care „declanșează” bonul de la final. */
const PAYMENT = { place: "Cafenea", value: 18.5 };
/** Partea din derulare în care camera înaintează; restul e scena cu POS-ul. */
const TRAVEL = 0.64;

const NOTE_COLORS: Record<number, string> = { 1: "var(--c-leu)", 5: "var(--c-mov)", 10: "var(--c-rosu)", 50: "var(--c-galben)", 100: "var(--c-albastru)" };

/** Generator pseudo-aleator cu sămânță fixă: aceeași lume la fiecare încărcare (și pe server). */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

type Thing = { kind: "note" | "coin"; x: number; y: number; z: number; rx: number; ry: number; rz: number; value: number; spin: number };
const THINGS: Thing[] = (() => {
  const r = rng(20261007);
  const out: Thing[] = [];
  const values = [1, 5, 10, 50, 100];
  for (let i = 0; i < 46; i++) {
    const side = i % 2 ? 1 : -1;
    const coin = i % 4 === 3;
    out.push({
      kind: coin ? "coin" : "note",
      x: side * (380 + r() * 900),
      y: -380 + r() * 760,
      z: -(300 + (i / 46) * (END - 300) + r() * 300),
      rx: -25 + r() * 50,
      ry: -40 + r() * 80,
      rz: -35 + r() * 70,
      value: values[Math.floor(r() * values.length)],
      spin: (r() - 0.5) * 140,
    });
  }
  return out;
})();

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
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const things = useRef<(HTMLDivElement | null)[]>([]);
  const hudBars = useRef<(HTMLSpanElement | null)[]>([]);
  const hudRest = useRef<HTMLSpanElement>(null);
  const hudStep = useRef<HTMLSpanElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const pos = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const fog = useRef<HTMLDivElement>(null);
  const cta = useRef<HTMLDivElement>(null);
  const posState = useRef(-1);
  const target = useRef(0);
  const narrow = useRef(false);

  // Derularea stabilește doar ținta; camera o ajunge din urmă lin, într-o buclă proprie.
  useScrollEffect(section, "sticky", (p) => {
    target.current = p;
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onMq = () => (narrow.current = mq.matches);
    onMq();
    mq.addEventListener("change", onMq);

    let cam = -1;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const goal = target.current;
      if (cam >= 0 && Math.abs(goal - cam) < 0.00005) return;
      cam = cam < 0 ? goal : cam + (goal - cam) * 0.11;
      render(cam);
    };

    const render = (p: number) => {
      const z = ease(range(p, 0, TRAVEL)) * (END - 120); // camera, care se oprește chiar în fața POS-ului
      const q = range(p, TRAVEL, 0.98); // scena cu POS-ul: 0 → 1
      const n = narrow.current;
      const sway = Math.sin(p * Math.PI * 3) * 4;
      if (world.current) world.current.style.transform = `rotateX(${Math.sin(p * Math.PI * 2) * 1.5}deg) rotateY(${sway}deg) translateZ(${z}px)`;

      // capitolele: apar din ceață, se citesc, apoi se dau la o parte înainte să treacă prin cameră
      CHAPTERS.forEach((_, i) => {
        const el = items.current[i];
        if (!el) return;
        const rel = z - (i + 1) * GAP; // < 0 încă în față
        // cât timp titlul e pe ecran, capitolele din spate nu se văd prin el
        const vis = range(rel, -3600, -2200) * (1 - range(rel, -380, 120)) * range(z, 350, 900);
        el.style.opacity = String(vis);
        el.style.visibility = vis < 0.01 ? "hidden" : "visible";
        const side = i % 2 ? 1 : -1;
        const push = range(rel, -700, 200) * 260; // se dau în lături când te apropii
        el.style.transform = `translate3d(calc(-50% + ${side * ((n ? 30 : 360) + push)}px), -50%, ${-(i + 1) * GAP}px) rotateY(${-side * (n ? 6 : 14)}deg)`;
      });

      // intro: titlul de la început se îndepărtează lent
      const intro = items.current[CHAPTERS.length];
      if (intro) {
        const t = range(z, 0, 900);
        intro.style.opacity = String(1 - t);
        intro.style.visibility = t > 0.99 ? "hidden" : "visible";
      }

      // bonul final
      const fin = items.current[CHAPTERS.length + 1];
      if (fin) {
        const vis = range(z - END, -3200, -1600);
        fin.style.opacity = String(vis);
        fin.style.visibility = vis < 0.01 ? "hidden" : "visible";
      }

      // POS: cardul vine, atinge ecranul, plata e aprobată, cardul pleacă, iar bonul iese din fantă
      if (card.current) {
        const come = ease(range(q, 0.02, 0.26));
        const go = ease(range(q, 0.44, 0.6));
        const tap = Math.sin(range(q, 0.26, 0.4) * Math.PI) * 14; // apăsarea pe ecran
        const x = (1 - come) * 560 - go * 620;
        const y = (1 - come) * 220 + go * 160 + tap;
        const r = (1 - come) * 28 - 8 - go * 20;
        card.current.style.transform = `translate(${x}px, ${y}px) rotateX(${32 - tap}deg) rotateZ(${r}deg)`;
        card.current.style.opacity = String(come * (1 - range(q, 0.56, 0.62)));
      }
      const s = q < 0.34 ? 0 : 1; // 0: așteaptă cardul, 1: aprobat
      if (pos.current && posState.current !== s) {
        posState.current = s;
        pos.current.dataset.state = s ? "ok" : "wait";
      }
      if (paper.current) {
        const t = range(q, 0.5, 0.9);
        const stepped = Math.floor(t * 28) / 28; // imprimanta termică înaintează în pași mici
        paper.current.style.transform = `translateY(${(1 - stepped) * 100}%)`;
      }
      if (fog.current) fog.current.style.opacity = String(1 - range(q, 0, 0.12)); // la casa de marcat nu mai e ceață

      if (caption.current) {
        // pe telefon textul stă sus și i-ar lua locul bonului, așa că pleacă înainte ca bonul să iasă de tot
        const show = range(q, 0, 0.06) * (n ? 1 - range(q, 0.68, 0.76) : 1);
        caption.current.style.opacity = String(show);
        caption.current.dataset.step = q < 0.34 ? "0" : q < 0.5 ? "1" : "2";
      }
      if (cta.current) {
        const show = ease(range(q, 0.86, 0.96));
        cta.current.style.opacity = String(show);
        cta.current.style.setProperty("--rise", `${(1 - show) * 20}px`);
        cta.current.style.pointerEvents = show > 0.5 ? "auto" : "none";
      }

      THINGS.forEach((t, i) => {
        const el = things.current[i];
        if (!el) return;
        const rel = z + t.z;
        const vis = range(rel, -4200, -2600) * (1 - range(rel, 250, 700));
        el.style.opacity = String(vis);
        el.style.visibility = vis < 0.01 ? "hidden" : "visible";
        if (vis < 0.01) return;
        const x = n ? t.x * 0.45 : t.x;
        el.style.transform = `translate3d(${x}px, ${t.y}px, ${t.z}px) rotateX(${t.rx}deg) rotateY(${t.ry + p * t.spin}deg) rotateZ(${t.rz + p * t.spin * 0.4}deg)`;
      });

      // bonul de jos: ce s-a alocat până acum
      let used = 0;
      let step = 0;
      PARTS.forEach((part, i) => {
        const f = ease(range(z, (i + 2) * GAP - 900, (i + 2) * GAP - 200));
        if (f > 0.5) step = i + 1;
        used += part.value * f;
        const bar = hudBars.current[i];
        if (bar) bar.style.width = `${(part.value / INCOME) * 100 * f}%`;
      });
      if (hudRest.current) hudRest.current.textContent = money(INCOME - used);
      if (hudStep.current) hudStep.current.textContent = `${step}/${PARTS.length}`;
      if (hud.current) {
        const show = range(z, GAP - 900, GAP - 300) * (1 - range(p, TRAVEL - 0.03, TRAVEL + 0.01));
        hud.current.style.opacity = String(show);
        hud.current.style.transform = `translate(-50%, ${(1 - show) * 24}px)`;
      }
      if (hint.current) hint.current.style.opacity = String(1 - range(p, 0, 0.03));
    };

    render(target.current);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  const at = (z: number, extra = ""): CSSProperties => ({ transform: `translate3d(-50%, -50%, ${z}px) ${extra}` });

  return (
    <section ref={section} className="relative h-[1300vh]" aria-label="O lună din bugetul tău">
      <div className="sw-stage sticky top-0 h-[100svh] overflow-hidden">
        {/* Scena 3D: podeaua, bancnotele (decor) și textele, toate în aceeași lume prin care înaintează camera. */}
        <div className="sw-scene">
          <div ref={world} className="sw-world">
            <div className="sw-floor" aria-hidden />
            {THINGS.map((t, i) => (
              <div key={i} ref={(el) => void (things.current[i] = el)} className="sw-thing" aria-hidden>
                {t.kind === "note" ? <Note value={t.value} /> : <Coin />}
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
              <Finale card={card} pos={pos} paper={paper} />
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

        <div ref={caption} className="sw-caption" data-step="0" style={{ opacity: 0 }} aria-live="polite">
          <p className="kicker">Casa de marcat · {PAYMENT.place}</p>
          <h2 className="sw-cap sw-cap-0">Plătești cu cardul la POS.</h2>
          <h2 className="sw-cap sw-cap-1">Plată aprobată.</h2>
          <h2 className="sw-cap sw-cap-2">Leuța îți scoate bonul.</h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft sm:text-[16px]">
            Cheltuiala de {money(PAYMENT.value)} lei intră pe bonul lunii, la locul ei, iar restul se recalculează pe loc.
          </p>
        </div>

        <div ref={cta} className="sw-cta" style={{ opacity: 0, pointerEvents: "none" }}>
          <a href="#invitatie" className="btn-primary">
            Vreau bonul meu <span aria-hidden>›</span>
          </a>
          <a href={`${SITE.appUrl}/login`} className="btn-ghost bg-paper/70 backdrop-blur-sm">
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
        <a href="#functii" className="btn-ghost bg-paper/60 backdrop-blur-sm">
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

type Ref = RefObject<HTMLDivElement>;

/** Casa de marcat: bonul lunii (ascuns în fantă până la plată), POS-ul și cardul. */
function Finale({ card, pos, paper }: { card: Ref; pos: Ref; paper: Ref }) {
  return (
    <div className="flex w-[min(88vw,380px)] flex-col items-center">
      <div className="w-[92%] overflow-hidden px-2 pt-3">
        <div ref={paper} style={{ transform: "translateY(100%)" }}>
          <div className="panel !mb-0 px-5 pb-5 pt-6 text-[12.5px]">
            <div className="text-center">
              <p className="text-[16px] font-bold tracking-tight">LEUȚA</p>
              <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">Bonul lunii · octombrie 2026</p>
            </div>
            <div className="rule-dashed my-3" />
            <Row label="Venit" value={INCOME} color="var(--c-leu)" strong />
            <div className="mt-1.5 space-y-1">
              {PARTS.map((p) => (
                <Row key={p.label} label={p.label} value={p.value} color={p.color} sign="−" />
              ))}
            </div>
            <div className="rule-double my-3" />
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">REST NEALOCAT</span>
              <span className="num text-[20px] font-bold text-leu">
                {money(REST)} <span className="text-[12px] font-medium">lei</span>
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-[4px] bg-rosu-tint/70 px-2.5 py-1.5 text-[11.5px]">
              <span>
                Ultima plată · {PAYMENT.place} · <span className="font-semibold">card</span>
              </span>
              <span className="num font-semibold text-rosu">− {money(PAYMENT.value)}</span>
            </div>
            <Barcode value="leuta-2026-10" className="mx-auto mt-3 h-8 w-44 text-ink" />
          </div>
        </div>
      </div>

      <div ref={pos} className="sw-pos" data-state="wait" aria-hidden>
        <div className="sw-pos-slot" />
        <div className="sw-pos-screen">
          <div className="sw-pos-wait">
            <span className="text-[10px] uppercase tracking-[0.2em] opacity-70">De plată</span>
            <span className="num text-[24px] font-bold leading-tight">{money(PAYMENT.value)} lei</span>
            <span className="sw-pos-waves">
              <i />
              <i />
              <i />
            </span>
            <span className="text-[10px] uppercase tracking-[0.12em] opacity-70">Apropiați cardul</span>
          </div>
          <div className="sw-pos-ok">
            <span className="sw-pos-check">✓</span>
            <span className="text-[15px] font-bold uppercase tracking-[0.14em]">Aprobat</span>
            <span className="text-[10px] uppercase tracking-[0.12em] opacity-70">Se tipărește bonul…</span>
          </div>
        </div>
        <div className="sw-pos-keys">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => (
            <span key={k}>{k}</span>
          ))}
        </div>
        <div className="sw-pos-keys sw-pos-fn">
          <span className="bg-[#b5455a]">✕</span>
          <span className="bg-[#c99a2e]">‹</span>
          <span className="bg-[#3d7a4e]">○</span>
        </div>
        <div ref={card} className="sw-card" style={{ opacity: 0 }}>
          <span className="sw-card-chip" />
          <span className="sw-card-nfc">)))</span>
          <span className="sw-card-num num">•••• •••• •••• 2026</span>
          <span className="sw-card-name">ANA POPESCU</span>
        </div>
      </div>
    </div>
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

function Coin() {
  return <div className="sw-coin">L</div>;
}


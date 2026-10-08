"use client";

import { useEffect, useRef } from "react";
import { ease, range, usePrefersReducedMotion, useScrollEffect } from "@/lib/site/scroll";

/** Clipul de prezentare (vertical, are propria ramă de telefon): pornește singur (fără sunet) doar cât timp se vede. */
export function VideoSection() {
  const video = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const v = video.current;
    if (!v || reduced) return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <section className="relative overflow-hidden bg-ink py-20 text-paper md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 md:grid-cols-2">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-paper/60 sm:text-[13px]">28 de secunde</p>
          <h2 className="mt-4 text-[32px] font-bold leading-[1.08] sm:text-[48px]">Vezi Leuța în acțiune.</h2>
          <p className="mt-5 max-w-md text-[15.5px] text-paper/75 sm:text-[17px]">
            De la panoul lunii la o cheltuială nouă, la credite și economii. Așa arată aplicația pe telefon, fără nicio instalare: se deschide din browser și se
            poate pune pe ecranul principal.
          </p>
          <ul className="mt-8 space-y-2 text-[14.5px] text-paper/80">
            {["Funcționează pe iPhone, Android și calculator", "Temă luminoasă și întunecată", "Lei și euro, cu cursul BNR"].map((t) => (
              <li key={t} className="flex items-baseline gap-3">
                <span className="text-leu">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center">
          <div className="relative aspect-[9/16] w-[min(78vw,360px)] overflow-hidden rounded-2xl bg-paper shadow-[0_30px_80px_rgb(0_0_0/0.45)] ring-1 ring-paper/10">
            <video
              ref={video}
              className="absolute inset-0 h-full w-full object-cover"
              src="/media/leuta-promo.mp4"
              poster="/media/leuta-promo-poster.webp"
              muted
              loop
              playsInline
              preload="metadata"
              controls={reduced}
              aria-label="Clip de prezentare a aplicației Leuța"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Pagina „Luna” pe calculator: fereastra se îndreaptă din perspectivă pe măsură ce intră în ecran. */
export function DesktopSection() {
  const ref = useRef<HTMLElement>(null);
  const win = useRef<HTMLDivElement>(null);
  useScrollEffect(ref, "through", (p) => {
    const t = ease(range(p, 0.05, 0.45));
    if (win.current) win.current.style.transform = `perspective(1800px) rotateX(${(1 - t) * 24}deg) scale(${0.88 + t * 0.12}) translateY(${(1 - t) * 40}px)`;
  });
  return (
    <section ref={ref} className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
      <div className="text-center">
        <p className="kicker">Și pe calculator</p>
        <h2 className="mx-auto mt-4 max-w-3xl text-[30px] font-bold leading-[1.1] sm:text-[46px]">Tot anul tău financiar, pe un singur ecran.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-[15.5px] text-ink-soft sm:text-[17px]">
          Același cont, sincronizat. Pe ecran mare vezi ultimele 12 luni, recomandările lunii și toate creditele dintr-o privire.
        </p>
      </div>
      <div ref={win} className="mt-12 overflow-hidden rounded-xl bg-sheet shadow-[0_40px_90px_rgb(var(--shadow)/0.25),0_6px_18px_rgb(var(--shadow)/0.15)] ring-1 ring-ink/5" style={{ transformOrigin: "50% 100%" }}>
        <div className="flex h-9 items-center gap-2 border-b border-line bg-paper/70 px-4 sm:h-11">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-full bg-line-strong sm:h-3 sm:w-3" />
          ))}
          <span className="ml-4 hidden h-6 flex-1 max-w-sm items-center rounded-md bg-line/70 px-3 text-[12px] text-ink-faint sm:flex">app.leuta.ro</span>
        </div>
        <img src="/ecrane/d-light-home.webp" alt="Panoul aplicației Leuța pe calculator" width={1920} height={1200} loading="lazy" decoding="async" className="block h-auto w-full" />
      </div>
    </section>
  );
}

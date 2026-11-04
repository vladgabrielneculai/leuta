"use client";

import { useEffect, useRef } from "react";

/**
 * O rozetă de ghioș (guilloche), ca pe bancnote: curbe hipotrohoide suprapuse, desenate cu linii foarte fine
 * într-un `canvas`. E pur decorativă și abia vizibilă (gri); se redesenează când se schimbă tema sau mărimea.
 */
export function Guilloche({ className = "", rings = 5 }: { className?: string; rings?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.strokeStyle = getComputedStyle(cv).color;
      ctx.lineWidth = 0.45;
      const cx = r.width / 2;
      const cy = r.height / 2;
      const scale = Math.min(r.width, r.height) / 190;
      for (let k = 0; k < rings; k++) {
        const R = (70 + k * 7) * scale;
        const rr = (21 + k * 1.3) * scale;
        const d = (36 + k * 4) * scale;
        ctx.globalAlpha = 0.5 - k * 0.06;
        ctx.beginPath();
        for (let t = 0; t <= Math.PI * 2 * 21; t += 0.02) {
          const x = cx + (R - rr) * Math.cos(t) + d * Math.cos(((R - rr) / rr) * t);
          const y = cy + (R - rr) * Math.sin(t) - d * Math.sin(((R - rr) / rr) * t);
          if (t === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    // Tema se schimbă prin atributul data-theme de pe <html> (vezi lib/theme.ts).
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [rings]);

  return <canvas ref={ref} className={`pointer-events-none ${className}`} aria-hidden />;
}

/** Rând de microtext, ca pe marginea bancnotelor. Decorativ. */
export function MicroText({ className = "" }: { className?: string }) {
  return (
    <div className={`overflow-hidden whitespace-nowrap font-mono text-[5px] leading-none tracking-[0.18em] text-ink-faint/70 ${className}`} aria-hidden>
      {"LEUȚA · BUGETUL TĂU, BAN CU BAN · ".repeat(8)}
    </div>
  );
}

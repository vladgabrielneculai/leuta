"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Un singur ascultător de scroll pentru toată pagina. Fiecare efect se abonează cu o funcție
 * apelată o dată pe cadru (requestAnimationFrame) cât timp pagina se mișcă.
 */
type Job = () => void;
const jobs = new Set<Job>();
let queued = false;

function tick() {
  queued = false;
  jobs.forEach((j) => j());
}
function schedule() {
  if (!queued) {
    queued = true;
    requestAnimationFrame(tick);
  }
}
let bound = false;
function bind() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** 0 → 1 între `a` și `b` (în afara intervalului rămâne la capete). */
export const range = (v: number, a: number, b: number) => clamp((v - a) / (b - a));
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Progresul unui element prin ecran:
 * - "through": 0 când partea de sus intră pe jos în ecran, 1 când partea de jos iese pe sus;
 * - "sticky": 0 când elementul atinge marginea de sus, 1 când partea lui de jos ajunge la marginea de jos
 *   (pentru secțiunile înalte cu un copil `position: sticky`).
 */
export function measure(el: Element, mode: "through" | "sticky") {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (mode === "sticky") return clamp(-r.top / Math.max(1, r.height - vh));
  return clamp((vh - r.top) / (vh + r.height));
}

/** Apelează `fn(progres)` la fiecare cadru în care elementul e (aproape) pe ecran. */
export function useScrollEffect<T extends Element>(ref: RefObject<T | null>, mode: "through" | "sticky", fn: (p: number) => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    bind();
    let last = -1;
    const job = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > window.innerHeight + 200) {
        // în afara ecranului: lasă efectul la capătul cel mai apropiat, o singură dată
        const edge = r.top > 0 ? 0 : 1;
        if (last !== edge) fnRef.current((last = edge));
        return;
      }
      const p = measure(el, mode);
      if (Math.abs(p - last) > 0.0005) fnRef.current((last = p));
    };
    jobs.add(job);
    job();
    return () => {
      jobs.delete(job);
    };
  }, [ref, mode]);
}

/** Varianta cu stare React (pentru componente mici: contoare, pași). Rotunjit la 1/1000. */
export function useScrollProgress<T extends Element>(ref: RefObject<T | null>, mode: "through" | "sticky" = "through") {
  const [p, setP] = useState(0);
  useScrollEffect(ref, mode, (v) => setP(Math.round(v * 1000) / 1000));
  return p;
}

/** Devine `true` (o singură dată) când elementul intră în ecran. */
export function useInView<T extends Element>(ref: RefObject<T | null>, margin = "0px 0px -15% 0px") {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, seen]);
  return seen;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

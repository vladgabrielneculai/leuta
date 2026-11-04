"use client";

import { useEffect, useState, type RefObject } from "react";

/** Devine `true` (o singură dată) când elementul intră în ecran. Folosit de Reveal pentru apariții la derulare. */
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

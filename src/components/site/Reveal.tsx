"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { useInView } from "@/lib/site/scroll";

/** Apare (fade + ridicare) când intră în ecran. `delay` în ms, pentru apariții în cascadă. */
export default function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: ElementType }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <Tag ref={ref} className={`reveal ${seen ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

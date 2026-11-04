"use client";

import type { ReactNode } from "react";
import { barcodeBars } from "@/lib/barcode";

/**
 * Piesele „de bon” folosite în toată aplicația (același stil ca bonul lunar în PDF):
 * rândul cu puncte între etichetă și sumă, codul de bare decorativ și antetul cu numărul bonului.
 */

/** Cod de bare decorativ (nu codifică nimic), desenat în culoarea textului. */
export function Barcode({ seed, className = "h-9 w-52" }: { seed: string; className?: string }) {
  const W = 200;
  return (
    <svg viewBox={`0 0 ${W} 40`} preserveAspectRatio="none" className={className} aria-hidden>
      {barcodeBars(seed, W).map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * Rând de bon: eticheta în stânga, valoarea în dreapta, legate prin puncte.
 * Eticheta se poate rupe pe mai multe rânduri; punctele umplu doar spațiul liber de pe ultimul.
 */
export function Leader({
  label,
  value,
  sub,
  className = "",
  strong = false,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return (
    <div className={className}>
      <div className={`flex items-baseline gap-1.5 ${strong ? "font-semibold" : ""}`}>
        <span className="min-w-0">{label}</span>
        <span className="leader-dots min-w-3 flex-1 sm:min-w-6" aria-hidden />
        <span className="num shrink-0 whitespace-nowrap text-right">{value}</span>
      </div>
      {sub && <div className="mt-0.5 text-right text-[12px] text-ink-faint num">{sub}</div>}
    </div>
  );
}


/** Data și ora curente, doar în browser (pe server ar da altă oră decât la afișare). */
